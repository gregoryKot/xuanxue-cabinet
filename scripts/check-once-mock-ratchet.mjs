#!/usr/bin/env node
// Храповик «мигающая заглушка apiFetch»: сколько раз в тестах web/src на
// замоканном apiFetch (обычно `mockedApiFetch`, см.
// web/src/test-support/apiFetchMock.ts) поставлена заглушка одного вызова —
// `mockResolvedValueOnce`/`mockRejectedValueOnce`. Счётчик может только
// уменьшаться (CLAUDE.md, «Храповики»); новый вырос — CI красный.
//
// Почему это гейт, а не совет в шапке apiFetchMock.ts (CLAUDE.md, правило
// 1д — «ошибка чинится вместе с причиной»). Инцидент a155bc1 (2026-09-20,
// шапка apiFetchMock.ts): `mockResolvedValueOnce(...)` в тесте достаётся не
// тому вызову apiFetch, если компонент при монтировании делает ещё один
// запрос, — и тест мигает по порядку хуков, а не по тому, что проверяет
// автор. Завели mockApiByPath (ответ по префиксу пути, от порядка вызовов не
// зависит), но писать по-старому ничто не мешало. 2026-09-22 то же самое
// повторилось: форма при открытии стала запрашивать список тегов, и очередь
// `…Once` в двенадцати местах четырёх `*EditorScreen.test.tsx` начала ловить
// чужой запрос — механизм был словом в комментарии, а не гейтом.
//
// Разбор — поверх общего сканера scripts/source-text.mjs (гасит комментарии
// и содержимое строковых литералов), не свой regexp по сырому тексту:
// иначе гейт посчитал бы упоминание в комментарии — ровно находка H2 аудита
// 2026-09-22 (комментарий сломал гейт маршрутов). Считаются только заглушки
// на apiFetch, а не любой `…Once` в проекте: у `vi.fn()`-моков без общего
// файла-обёртки этой проблемы нет (порядок их вызовов не подменяют соседние
// хуки на других ресурсах).
//
// ЧЕСТНО про эвристику (тот же приём, что в check-write-then-reload.mjs и
// check-outbound-timeout.mjs — см. их шапки): identifier мока ищется по
// имени `mockedApiFetch` (общее соглашение проекта, см. импорт из
// apiFetchMock.ts) и по локальному `const X = vi.mocked(apiFetch)`; вызов
// `vi.mocked(apiFetch).mockResolvedValueOnce(...)` одной строкой без
// промежуточной переменной сегодня в репозитории не встречается и не
// разбирается отдельно.
//
// Разбор вынесен в чистые функции без fs (findApiFetchMockIdentifiers,
// findOnceMockFindings, diffByFile) — check-once-mock-ratchet.test.mjs
// гоняет их на строках-фикстурах, не на сегодняшнем состоянии web/src.
import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { stripLiterals } from './source-text.mjs';

const ROOT = join(import.meta.dirname, '..');
const WEB_SRC = join(ROOT, 'web', 'src');
const BASELINE_PATH = join(ROOT, 'scripts', 'once-mock-baseline.json');
const UPDATE = process.argv.includes('--update');

// `mockedApiFetch` — имя, под которым apiFetchMock.ts экспортирует общий мок,
// и которое каждый файл, объявляющий его сам, использует один в один (84 из
// 84 на 2026-09-22) — см. шапку файла.
const CONVENTION_NAME = 'mockedApiFetch';
const LOCAL_DECL_RE = /\b(?:const|let)\s+(\w+)\s*=\s*vi\.mocked\(\s*apiFetch\s*\)/g;
const ONCE_CALL_RE = /\.mock(Resolved|Rejected)ValueOnce\(/g;
const IDENTIFIER_CHAR_RE = /[A-Za-z0-9_$]/;

/** Имена переменных, за которыми в файле стоит замоканный apiFetch: всегда
 * CONVENTION_NAME (используется либо через импорт из apiFetchMock.ts, либо
 * объявлен так же локально) плюс любые локальные `const X = vi.mocked(apiFetch)`
 * под другим именем. `cleaned` — уже без комментариев и содержимого строк
 * (scripts/source-text.mjs), чтобы упоминание в комментарии не считалось. */
export function findApiFetchMockIdentifiers(cleaned) {
  const names = new Set([CONVENTION_NAME]);
  for (const match of cleaned.matchAll(LOCAL_DECL_RE)) names.add(match[1]);
  return names;
}

/** Номер строки (1-based) позиции `index` в исходном тексте `src`. */
function lineAt(src, index) {
  let line = 1;
  for (let i = 0; i < index; i += 1) if (src[i] === '\n') line += 1;
  return line;
}

/** Индекс `(`, парной закрывающей `)` на `closeIndex`, при обходе НАЗАД по
 * уже очищенному тексту (симметрично matchingParen в
 * check-outbound-timeout.mjs, который идёт вперёд). */
function matchingOpenParen(cleaned, closeIndex) {
  let depth = 0;
  for (let i = closeIndex; i >= 0; i -= 1) {
    if (cleaned[i] === ')') depth += 1;
    else if (cleaned[i] === '(' && (depth -= 1) === 0) return i;
  }
  return -1;
}

/** Идентификатор, оканчивающийся ровно на позиции `end` (включительно), при
 * чтении назад. `null`, если на `end` не буква/цифра/`_`/`$`. */
function readIdentifierEndingAt(cleaned, end) {
  if (end < 0 || !IDENTIFIER_CHAR_RE.test(cleaned[end])) return null;
  let start = end;
  while (start >= 0 && IDENTIFIER_CHAR_RE.test(cleaned[start])) start -= 1;
  return cleaned.slice(start + 1, end + 1);
}

function skipWhitespaceBackward(cleaned, index) {
  let i = index;
  while (i >= 0 && /\s/.test(cleaned[i])) i -= 1;
  return i;
}

/** Корень цепочки вызовов, на которой стоит `.mock…Once(` в позиции точки
 * `dotIndex` (уже очищенный текст). Раскручивает цепочку назад через любое
 * число `.метод(…)` — `a.x().y().mockResolvedValueOnce()` — до первого
 * идентификатора без предшествующей точки. Промежуточные скобки могут быть
 * многострочными: индекс, не текст, поэтому переносы строк не мешают.
 * `null`, если назад от точки не идентификатор и не сбалансированный вызов
 * (цепочка начинается с чего-то другого — литерала, IIFE и т.п.). */
export function chainRootIdentifier(cleaned, dotIndex) {
  let i = skipWhitespaceBackward(cleaned, dotIndex - 1);
  for (;;) {
    if (i < 0) return null;
    if (cleaned[i] === ')') {
      const open = matchingOpenParen(cleaned, i);
      if (open === -1) return null;
      i = skipWhitespaceBackward(cleaned, open - 1);
      const methodName = readIdentifierEndingAt(cleaned, i);
      if (methodName === null) return null;
      i = skipWhitespaceBackward(cleaned, i - methodName.length);
      if (cleaned[i] !== '.') return null;
      i = skipWhitespaceBackward(cleaned, i - 1);
      continue;
    }
    return readIdentifierEndingAt(cleaned, i);
  }
}

/** Находки файла `fileLabel`: строка каждой заглушки `mockResolvedValueOnce`/
 * `mockRejectedValueOnce`, поставленной (напрямую или через цепочку) на
 * идентификатор из findApiFetchMockIdentifiers. Файл без такого
 * идентификатора возвращает пустой список без сканирования вызовов. */
export function findOnceMockFindings(fileLabel, src) {
  const cleaned = stripLiterals(src);
  const identifiers = findApiFetchMockIdentifiers(cleaned);
  const findings = [];
  for (const match of cleaned.matchAll(ONCE_CALL_RE)) {
    const root = chainRootIdentifier(cleaned, match.index);
    if (root !== null && identifiers.has(root)) {
      findings.push({
        file: fileLabel,
        line: lineAt(src, match.index),
        method: `mock${match[1]}ValueOnce`,
      });
    }
  }
  return findings;
}

/** Файлы, где находок стало больше, чем в бейслайне (`increased`, гейт из-за
 * них падает), и файлы, где меньше (`improved`, можно сократить бейслайн).
 * Без изменений — нигде: и падать, и советовать не о чем. */
export function diffByFile(counts, baselineByFile) {
  const increased = [];
  const improved = [];
  const files = new Set([...Object.keys(counts), ...Object.keys(baselineByFile)]);
  for (const file of files) {
    const found = counts[file] ?? 0;
    const before = baselineByFile[file] ?? 0;
    if (found > before) increased.push({ file, found, before });
    else if (found < before) improved.push({ file, found, before });
  }
  return { increased, improved };
}

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      yield* walk(p);
      continue;
    }
    if (/\.test\.tsx?$/.test(p)) yield p;
  }
}

function collectCounts() {
  const counts = {};
  for (const file of walk(WEB_SRC)) {
    const fileLabel = relative(ROOT, file);
    const src = readFileSync(file, 'utf8');
    const n = findOnceMockFindings(fileLabel, src).length;
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
    `Бейслайн обновлён: ${total} заглушек в ${Object.keys(byFile).length} файлах.`,
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
      'Нет бейслайна — сгенерируй: node scripts/check-once-mock-ratchet.mjs --update',
    );
    process.exit(1);
  }

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const { increased, improved } = diffByFile(counts, baseline.byFile ?? {});

  if (total > baseline.total) {
    console.error(
      `❌ once-mock-храповик: заглушек apiFetch стало больше: ${baseline.total} → ${total}.`,
    );
    console.error('Прибавилось в файлах:');
    for (const { file, found, before } of increased) {
      console.error(`   ${file}: было ${before}, стало ${found}`);
    }
    console.error(
      '\nmockResolvedValueOnce/mockRejectedValueOnce на apiFetch зависят от порядка\n' +
        'вызовов — соседний хук на монтировании съедает чужую заглушку, и тест\n' +
        'начинает мигать (a155bc1, 2026-09-20; повтор 2026-09-22). Вместо очереди\n' +
        '`…Once` — маршрутизация ответа по пути запроса:\n' +
        "  mockApiByPath({ '/tags': [...], '/lessons': [...] })\n" +
        '(web/src/test-support/apiFetchMock.ts). Бейслайн обновляется только вниз:\n' +
        '  node scripts/check-once-mock-ratchet.mjs --update',
    );
    process.exit(1);
  }

  console.log(
    total < baseline.total
      ? `✓ once-mock-храповик: ${total} < ${baseline.total} — стало лучше, зафиксируй: ` +
          `node scripts/check-once-mock-ratchet.mjs --update (${improved.length} файлов улучшилось)`
      : `✓ once-mock-храповик: ${total} (без роста)`,
  );
}

// Запуск как самостоятельный скрипт (CI, `npm run gates`) — не при импорте из
// теста (import.meta.url !== process.argv[1] в этом случае).
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
