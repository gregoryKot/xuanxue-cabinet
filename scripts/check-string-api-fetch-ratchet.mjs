#!/usr/bin/env node
// Храповик «строковые вызовы apiFetch»: сколько мест в боевом коде web/src
// зовут старый `apiFetch('/путь', …)` со строкой-путём. Счётчик может только
// уменьшаться (CLAUDE.md, «Храповики»); вырос — CI красный.
//
// Зачем (docs/PLAN.md §17.1). Пару «кабинет ↔ API» не сверял ни один гейт:
// фронт пишет путь строкой, бэк объявляет его декоратором, и рассинхрон
// (`Cannot GET /api/materials/:id`, 2026-09-27) видно только у пользователя.
// Лекарство из §17.1 — карта маршрутов `shared/src/api-routes.ts` и
// типизированный `apiRoute(key, …)` в `web/src/api/apiRoute.ts`: неверный
// ключ или тело не собираются в `tsc`. Шаг 2 переводит вызовы на карту по
// доменам; этот храповик следит, чтобы строковых вызовов только убывало, а
// новый код шёл через карту. Последний PR §17.1 удаляет строковый apiFetch,
// этот гейт и check-editor-routes.mjs — они держат ту же дыру по-старому.
//
// Текстовую сверку контракта (`check-api-contract.mjs`) в §17.1 отвергли:
// регулярка по путям хрупка, а карта в `shared/` проверяется компилятором.
// Поэтому здесь про пути нет ничего — скрипт только считает вызовы.
//
// Разбор — поверх общего сканера scripts/source-text.mjs (гасит комментарии и
// содержимое строк): упоминание `apiFetch(` в комментарии не считается.
//
// ЧЕСТНО про эвристику (тот же приём, что в check-once-mock-ratchet.mjs и
// check-outbound-timeout.mjs — см. их шапки): считается только сам вызов по
// имени. `const f = apiFetch; f('/x')` или `apiFetch.call(…)` гейт не видит —
// для счётчика, который снимет последний PR §17.1, такая слепота приемлема:
// так в проекте не пишут, а обойти гейт намеренно ревью заметит.
//
// Разбор вынесен в чистые функции без fs (skipGenerics, findStringApiFetchCalls)
// — check-string-api-fetch-ratchet.test.mjs гоняет их на строках-фикстурах,
// не на сегодняшнем состоянии web/src.
import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { stripLiterals } from './source-text.mjs';
// Сравнение с бейслайном по файлам — то же, что у храповика заглушек, одна
// функция на оба гейта (jscpd, CLAUDE.md «Дубли и мёртвый код»).
import { isBridgeFile } from './string-api-fetch-bridges.mjs';
import { diffByFile } from './check-once-mock-ratchet.mjs';

const ROOT = join(import.meta.dirname, '..');
const WEB_SRC = join(ROOT, 'web', 'src');
const BASELINE_PATH = join(ROOT, 'scripts', 'string-api-fetch-baseline.json');
const UPDATE = process.argv.includes('--update');

// Мок-обвязка тестов не боевой код: apiFetch в ней подменяют, а не зовут.
const TEST_SUPPORT_DIR = 'web/src/test-support/';

// Слово целиком: `mockedApiFetch(` и `x.apiFetch(` не подходят (перед именем
// не буква/цифра/`_`/`$`/`.`). Объявление `function apiFetch<T>(` отсекается
// отдельно — оно не вызов.
const CALL_NAME_RE = /(?<![\w$.])apiFetch(?![\w$])/g;
const DECLARATION_RE = /\bfunction\s+$/;

/** Индекс сразу за парной `>` для `<`, стоящей на `openIndex`, или -1, если
 * пары нет. Вложенные `<…>` (`apiFetch<Array<X>>(`) считаются глубиной;
 * `=>` внутри (`<() => void>`) не закрывает скобку. */
export function skipGenerics(cleaned, openIndex) {
  let depth = 0;
  for (let i = openIndex; i < cleaned.length; i += 1) {
    if (cleaned[i] === '<') depth += 1;
    else if (cleaned[i] === '>' && cleaned[i - 1] !== '=') depth -= 1;
    if (depth === 0) return i + 1;
  }
  return -1;
}

/** Номер строки (1-based) позиции `index` в тексте. */
function lineAt(src, index) {
  let line = 1;
  for (let i = 0; i < index; i += 1) if (src[i] === '\n') line += 1;
  return line;
}

function skipWhitespace(text, from) {
  let i = from;
  while (i < text.length && /\s/.test(text[i])) i += 1;
  return i;
}

/** Строка каждого вызова `apiFetch(` / `apiFetch<…>(` в `src`. Комментарии и
 * содержимое строк гасятся до поиска; смещения при этом сохраняются, поэтому
 * номер строки берётся из очищенного текста. */
export function findStringApiFetchCalls(fileLabel, src) {
  const cleaned = stripLiterals(src);
  const findings = [];
  for (const match of cleaned.matchAll(CALL_NAME_RE)) {
    if (DECLARATION_RE.test(cleaned.slice(0, match.index))) continue;
    let i = skipWhitespace(cleaned, match.index + match[0].length);
    if (cleaned[i] === '<') {
      i = skipGenerics(cleaned, i);
      if (i === -1) continue;
      i = skipWhitespace(cleaned, i);
    }
    if (cleaned[i] === '(') {
      findings.push({ file: fileLabel, line: lineAt(cleaned, match.index) });
    }
  }
  return findings;
}

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      yield* walk(p);
      continue;
    }
    const label = relative(ROOT, p).split('\\').join('/');
    if (!/\.tsx?$/.test(p) || /\.test\.tsx?$/.test(p)) continue;
    if (isBridgeFile(label) || label.startsWith(TEST_SUPPORT_DIR)) continue;
    yield p;
  }
}

function collectCounts() {
  const counts = {};
  for (const file of walk(WEB_SRC)) {
    const fileLabel = relative(ROOT, file).split('\\').join('/');
    const n = findStringApiFetchCalls(fileLabel, readFileSync(file, 'utf8')).length;
    if (n > 0) counts[fileLabel] = n;
  }
  return counts;
}

function readBaseline() {
  try {
    return JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
  } catch {
    return null;
  }
}

function runUpdate(counts) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const byFile = {};
  for (const file of Object.keys(counts).sort()) byFile[file] = counts[file];
  writeFileSync(BASELINE_PATH, JSON.stringify({ total, byFile }, null, 2) + '\n');
  console.log(
    `Бейслайн обновлён: ${total} вызовов в ${Object.keys(byFile).length} файлах.`,
  );
}

function main() {
  const counts = collectCounts();

  if (UPDATE) {
    runUpdate(counts);
    return;
  }

  const baseline = readBaseline();
  if (baseline === null) {
    console.error(
      'Нет бейслайна — сгенерируй: node scripts/check-string-api-fetch-ratchet.mjs --update',
    );
    process.exit(1);
  }

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const { increased, improved } = diffByFile(counts, baseline.byFile ?? {});

  if (total > baseline.total) {
    console.error(
      `❌ храповик строковых apiFetch: вызовов стало больше: ${baseline.total} → ${total}.`,
    );
    console.error('Прибавилось в файлах:');
    for (const { file, found, before } of increased) {
      console.error(`   ${file}: было ${before}, стало ${found}`);
    }
    console.error(
      '\nПуть строкой в apiFetch не сверяется с бэкендом: рассинхрон виден только\n' +
        'пользователю (`Cannot GET /api/materials/:id`, 2026-09-27). Новый вызов —\n' +
        'через карту маршрутов: apiRoute(key, …) из web/src/api/apiRoute.ts, ключи\n' +
        'в shared/src/api-routes.ts (docs/PLAN.md §17.1). Бейслайн обновляется только\n' +
        'вниз:\n' +
        '  node scripts/check-string-api-fetch-ratchet.mjs --update',
    );
    process.exit(1);
  }

  console.log(
    total < baseline.total
      ? `✓ храповик строковых apiFetch: ${total} < ${baseline.total} — стало лучше, зафиксируй: ` +
          `node scripts/check-string-api-fetch-ratchet.mjs --update (${improved.length} файлов улучшилось)`
      : `✓ храповик строковых apiFetch: ${total} (без роста)`,
  );
}

// Запуск как самостоятельный скрипт (CI, `npm run gates`) — не при импорте из
// теста (import.meta.url !== process.argv[1] в этом случае).
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
