#!/usr/bin/env node
// Храповик «запись + сразу перечитывание» (ADR-0087, docs/adr/0087-fresh-state-comes-from-the-write-response.md):
// хук делает apiFetch(..., { method: 'POST'|'PATCH'|'PUT'|'DELETE' }) и тут же
// `await reload()`/`await refresh()` — второй round-trip за тем же самым,
// хотя ответ записи (или сам эндпоинт, если бы отдавал DTO) уже мог принести
// свежее состояние. На проде TTFB 0.5–1.1 с (замер web/index.html) — значит
// действие стоит секунды вместо одной, и всё это время экран показывает
// скелетон заново.
//
// ЧЕСТНО про эвристику: она регулярная, без парсера AST (CLAUDE.md
// «Зависимости» — не тянем зависимость ради гейта) и приблизительная —
// смотрит только на соседний текст файла:
//   - не увидит случай, размазанный по нескольким функциям или файлам
//     (например BroadcastDeliveriesList.tsx: apiFetch зовёт DeliveryCard.tsx,
//     а `reload()` — родитель, через колбэк `onSent`, в другом файле);
//   - может ошибочно сработать там, где apiFetch и reload()/refresh() рядом
//     по тексту, но по смыслу не связаны.
// Поэтому гейт — храповик со списком известных мест
// (scripts/write-then-reload-allowlist.json), а не абсолютный запрет: новых
// мест сверх списка не появляется, а разбор старых — по одному, с причиной.
//
// Разбор вынесен в чистые функции без fs (findMutatingWriteLines,
// findWriteThenReloadFindings, diffAgainstAllowlist) —
// check-write-then-reload.test.mjs гоняет их на строках-фикстурах, а не на
// сегодняшнем состоянии web/src (тот же приём, что в check-adr-numbers.mjs и
// check-route-collisions.mjs — см. их шапки).
import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const ROOT = join(import.meta.dirname, '..');
const WEB_SRC = join(ROOT, 'web', 'src');
const ALLOWLIST_PATH = join(ROOT, 'scripts', 'write-then-reload-allowlist.json');
const UPDATE = process.argv.includes('--update');

const MUTATING_METHODS = ['POST', 'PATCH', 'PUT', 'DELETE'];

// Сколько строк вперёд от найденного apiFetch(...) с мутирующим методом
// смотрим в поисках await reload()/await refresh(). Сам вызов в этом
// кабинете — 1–4 строки (путь, method, body, закрывающая скобка со `);`),
// плюс иногда пара строк сброса локального состояния формы (setError(null)
// и т.п.) перед перечитыванием — реальные находки репозитория укладываются
// в 1–4 строки разрыва. 12 — с запасом на реформатирование и лишний
// промежуточный вызов, но не настолько много, чтобы поймать несвязанный
// reload() в хвосте длинной функции.
export const LOOKAHEAD_LINES = 12;

// Сколько символов после `apiFetch(`/`apiFetch<T>(` просматриваем в поисках
// `method: '...'`: путь (иногда длинный шаблонный литерал) и объект опций в
// этом кабинете умещаются в одну-три строки, 200 символов берёт это с
// запасом, но не дотягивается до следующего, не связанного вызова apiFetch
// чуть дальше по файлу (тот же приём, что CONST_NAME_WINDOW в
// check-card-list-gap.mjs).
const METHOD_WINDOW_CHARS = 200;

// `apiFetch(` или `apiFetch<Тип>(` — вызов иногда несёт явный дженерик
// (`apiFetch<void>('/me/profile', …)`, welcome/useProfileSetup.ts и другие).
const WRITE_CALL_RE = /apiFetch(?:<[^>]*>)?\(/g;
const MUTATING_METHOD_RE = new RegExp(
  `method\\s*:\\s*['"](?:${MUTATING_METHODS.join('|')})['"]`,
);
const RELOAD_RE = /\bawait\s+(?:reload|refresh)\s*\(\s*\)/;

/** Номер строки (1-based) позиции `index` в исходном тексте `src`. */
function lineAt(src, index) {
  let line = 1;
  for (let i = 0; i < index; i += 1) {
    if (src[i] === '\n') line += 1;
  }
  return line;
}

/** Номера строк (1-based), на которых начинается вызов `apiFetch(...)` с
 * мутирующим методом (`method: 'POST'|'PATCH'|'PUT'|'DELETE'`) где-то в
 * ближайших METHOD_WINDOW_CHARS символах после начала вызова. GET-вызовы
 * (метод не указан или `method: 'GET'`) сюда не попадают. */
export function findMutatingWriteLines(src) {
  const lines = [];
  for (const match of src.matchAll(WRITE_CALL_RE)) {
    const window = src.slice(match.index, match.index + METHOD_WINDOW_CHARS);
    if (MUTATING_METHOD_RE.test(window)) lines.push(lineAt(src, match.index));
  }
  return lines;
}

/** Есть ли `await reload()`/`await refresh()` среди LOOKAHEAD_LINES строк,
 * идущих ПОСЛЕ строки `writeLine` (саму строку записи не считаем — находка
 * ищется в том, что идёт следом). `lines` — файл, уже разбитый по `\n`. */
function hasReloadAfter(lines, writeLine) {
  const from = writeLine; // lines[writeLine] (индекс) — строка writeLine+1 (номер)
  const to = Math.min(lines.length, writeLine + LOOKAHEAD_LINES);
  for (let i = from; i < to; i += 1) {
    if (RELOAD_RE.test(lines[i])) return true;
  }
  return false;
}

/** Находки файла `fileLabel`: строка записи, за которой в пределах
 * LOOKAHEAD_LINES следует перечитывание. Один вызов apiFetch — не больше
 * одной находки, даже если в окне видно несколько reload()/refresh(). */
export function findWriteThenReloadFindings(fileLabel, src) {
  const lines = src.split('\n');
  const findings = [];
  for (const writeLine of findMutatingWriteLines(src)) {
    if (hasReloadAfter(lines, writeLine))
      findings.push({ file: fileLabel, line: writeLine });
  }
  return findings;
}

/** Сравнение фактических находок (`{файл: количество}`) с аллоу-листом
 * (`{файл: {count, reason}}`): `exceeded` — файлы, где найдено больше, чем
 * записано (включая файлы, которых в списке нет вовсе, — для них allowed
 * считается 0), гейт из-за них падает; `improved` — файлы, где найдено
 * меньше записанного (аллоу-лист можно сократить через --update, гейт не
 * падает). Файл, где найдено ровно столько же, сколько записано, не
 * попадает никуда — обычное дело, ни падать, ни советовать не о чем. */
export function diffAgainstAllowlist(counts, allowlist) {
  const exceeded = [];
  const improved = [];
  const files = new Set([...Object.keys(counts), ...Object.keys(allowlist)]);
  for (const file of files) {
    const found = counts[file] ?? 0;
    const allowed = allowlist[file]?.count ?? 0;
    if (found > allowed)
      exceeded.push({ file, found, allowed, listed: file in allowlist });
    else if (found < allowed) improved.push({ file, found, allowed });
  }
  return { exceeded, improved };
}

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      yield* walk(p);
      continue;
    }
    if (!/\.tsx?$/.test(p)) continue;
    if (p.includes('.test.')) continue;
    yield p;
  }
}

function collectCounts() {
  const counts = {};
  for (const file of walk(WEB_SRC)) {
    const fileLabel = relative(ROOT, file);
    const src = readFileSync(file, 'utf8');
    const n = findWriteThenReloadFindings(fileLabel, src).length;
    if (n > 0) counts[fileLabel] = n;
  }
  return counts;
}

function readAllowlist() {
  try {
    return JSON.parse(readFileSync(ALLOWLIST_PATH, 'utf8'));
  } catch {
    return {};
  }
}

const UPDATE_PLACEHOLDER_REASON =
  'TODO: указать причину (ADR-0087) — почему перечитывание после записи остаётся, и чего не хватает, чтобы его убрать.';

function runUpdate(counts, allowlist) {
  const next = {};
  for (const file of Object.keys(counts).sort()) {
    next[file] = {
      count: counts[file],
      reason: allowlist[file]?.reason ?? UPDATE_PLACEHOLDER_REASON,
    };
  }
  writeFileSync(ALLOWLIST_PATH, JSON.stringify(next, null, 2) + '\n');

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  console.log(
    `Аллоу-лист обновлён: ${total} находок в ${Object.keys(next).length} файлах.`,
  );
  const fresh = Object.keys(next).filter((f) => allowlist[f] === undefined);
  if (fresh.length > 0) {
    console.log('Новые файлы без причины — допиши reason вручную:');
    for (const f of fresh) console.log(`  ${f}`);
  }
  const dropped = Object.keys(allowlist).filter((f) => !(f in next));
  if (dropped.length > 0) {
    console.log('Находок больше нет — записи сняты из аллоу-листа:');
    for (const f of dropped) console.log(`  ${f}`);
  }
}

function main() {
  const counts = collectCounts();
  const allowlist = readAllowlist();

  if (UPDATE) {
    runUpdate(counts, allowlist);
    return;
  }

  const { exceeded, improved } = diffAgainstAllowlist(counts, allowlist);

  if (exceeded.length > 0) {
    for (const { file, found, allowed, listed } of exceeded) {
      console.error(
        listed
          ? `❌ ${file}: найдено ${found}, в аллоу-листе ${allowed}`
          : `❌ ${file}: найдено ${found}, файла нет в scripts/write-then-reload-allowlist.json`,
      );
    }
    console.error(
      '\nЗапись (apiFetch с POST/PATCH/PUT/DELETE) и следом await reload()/refresh() —\n' +
        'второй round-trip за тем же самым (ADR-0087). Возьми свежее состояние из\n' +
        'ответа записи. Если эндпоинт отдаёт 204 — либо он начинает отдавать DTO,\n' +
        'либо перечитывание осознанно остаётся и файл идёт в аллоу-лист с причиной:\n' +
        '  node scripts/check-write-then-reload.mjs --update',
    );
    process.exit(1);
  }

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  console.log(
    improved.length > 0
      ? `✓ запись+перечитывание: новых мест нет, ${improved.length} файлов можно сократить — зафиксируй: ` +
          `node scripts/check-write-then-reload.mjs --update (сейчас ${total} находок)`
      : `✓ запись+перечитывание: новых мест нет (${total} находок в ${Object.keys(counts).length} файлах)`,
  );
}

// Запуск как самостоятельный скрипт (CI, `npm run gates`) — не при импорте из
// теста (import.meta.url !== process.argv[1] в этом случае).
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
