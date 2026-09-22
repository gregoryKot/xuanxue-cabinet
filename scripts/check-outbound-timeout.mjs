#!/usr/bin/env node
// Храповик «вызов в сеть без таймаута»: fetch(...) без signal: держит вызов
// до таймаута платформы, если сеть не рвётся, а молчит — тик планировщика
// не завершается, event.waitUntil в service worker висит (CLAUDE.md,
// «Храповики» п.5 и «Логи и наблюдаемость»). Сегодня таймаут есть у всех
// вызовов — гейт держит это, как check-route-collisions.mjs держит
// уникальность маршрутов.
//
// Разбор — в чистой функции без fs (findFetchesWithoutSignal) поверх общего
// сканера scripts/source-text.mjs (он же гасит литералы трём гейтам сразу):
// check-outbound-timeout.test.mjs гоняет их на строках-фикстурах, не на
// реальном дереве (тот же приём).
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { stripLiterals } from './source-text.mjs';

const ROOT = join(import.meta.dirname, '..');
// Тесты и тестовая инфраструктура не ходят в сеть в продакшене.
const EXCLUDED_SUFFIXES = ['.spec.ts', '.test.ts', '.test.tsx', '.e2e-spec.ts'];
const TEST_SUPPORT_DIR = join(ROOT, 'api', 'src', 'test-support');
// Где искать: каталог + расширение. web/public/sw.js — отдельно, не под web/src.
const TARGETS = [
  { dir: join(ROOT, 'api', 'src'), ext: /\.ts$/ },
  { dir: join(ROOT, 'web', 'src'), ext: /\.tsx?$/ },
];
const SW_FILE = join(ROOT, 'web', 'public', 'sw.js');

function isExcludedPath(path) {
  if (path.startsWith(`${TEST_SUPPORT_DIR}/`)) return true;
  return EXCLUDED_SUFFIXES.some((suffix) => path.endsWith(suffix));
}

// `fetch(` как самостоятельный вызов: слева — не буква/цифра/`_`/`$`/точка,
// иначе `this.httpFetch(`/`safeFetch(`/`prefetch(` тоже засчитались бы.
const FETCH_CALL_RE = /(?<![A-Za-z0-9_$.])fetch\(/g;
// Ключ `signal:` (и сокращённая форма `{ signal }`) по очищенному тексту
// аргументов — так `'signal: ...'` внутри строки-сообщения не в счёт.
const SIGNAL_KEY_RE = /\bsignal\b/;

function lineAt(src, index) {
  let line = 1;
  for (let i = 0; i < index; i += 1) if (src[i] === '\n') line += 1;
  return line;
}

/** Индекс скобки, закрывающей `(` на `openIndex`, в уже очищенном тексте —
 * скобки внутри строк и комментариев там не мешают счётчику. */
function matchingParen(cleaned, openIndex) {
  let depth = 0;
  for (let i = openIndex; i < cleaned.length; i += 1) {
    if (cleaned[i] === '(') depth += 1;
    else if (cleaned[i] === ')' && (depth -= 1) === 0) return i;
  }
  return -1;
}

/** Все вызовы `fetch(...)` файла: `{ line, snippet, hasSignal }`. Не
 * экспортируется: наружу отдаём только находки без signal, а main() число
 * проверенных вызовов считает по этому же списку. */
function scanFetchCalls(src) {
  const cleaned = stripLiterals(src);
  const lines = src.split('\n');
  const calls = [];
  for (const m of cleaned.matchAll(FETCH_CALL_RE)) {
    const openIndex = m.index + m[0].length - 1;
    const closeIndex = matchingParen(cleaned, openIndex);
    if (closeIndex === -1) continue; // несбалансированные скобки — не наш случай
    const args = cleaned.slice(openIndex + 1, closeIndex);
    const line = lineAt(src, m.index);
    calls.push({
      line,
      snippet: (lines[line - 1] ?? '').trim(),
      hasSignal: SIGNAL_KEY_RE.test(args),
    });
  }
  return calls;
}

/** Вызовы `fetch(...)` файла `src` без `signal:` в аргументах —
 * `{ line, snippet }` каждый. */
export function findFetchesWithoutSignal(src) {
  return scanFetchCalls(src)
    .filter((call) => !call.hasSignal)
    .map(({ line, snippet }) => ({ line, snippet }));
}

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else yield p;
  }
}

function collectFiles() {
  const files = [SW_FILE];
  for (const { dir, ext } of TARGETS) {
    for (const p of walk(dir)) {
      if (ext.test(p) && !isExcludedPath(p)) files.push(p);
    }
  }
  return files;
}

function main() {
  let totalCalls = 0;
  const findings = [];
  for (const file of collectFiles()) {
    const fileLabel = relative(ROOT, file);
    const calls = scanFetchCalls(readFileSync(file, 'utf8'));
    totalCalls += calls.length;
    for (const call of calls) {
      if (!call.hasSignal) findings.push({ file: fileLabel, ...call });
    }
  }

  if (findings.length > 0) {
    for (const { file, line, snippet } of findings) {
      console.error(`❌ ${file}:${line}: ${snippet}`);
    }
    console.error(
      '\nвызов в сеть без таймаута — signal: AbortSignal.timeout(МС); сеть,\n' +
        'которая молчит, держит вызов до таймаута платформы.',
    );
    process.exit(1);
  }
  console.log(`✓ исходящие вызовы без таймаута не найдены (${totalCalls} проверено)`);
}

// Запуск как самостоятельный скрипт — не при импорте из теста
// (import.meta.url !== process.argv[1] в этом случае).
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
