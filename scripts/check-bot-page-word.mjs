#!/usr/bin/env node
// Гейт «бот не знает страниц» (аудит 2026-10-01, F51): веб-текст «Попытка не
// найдена. Обновите страницу.» уходил в Telegram, где обновлять нечего.
// Проверка узкая и жёсткая (не храповик): строковый литерал в
// api/src/telegram/** с оборотом «обновите страницу» роняет CI. Само слово
// «страница» законно — «Страница 2 из 5» у списка вопросов
// (new-exam-pick-screen.ts) — поэтому ловится именно веб-совет обновиться.
// Сканирует литералы по очищенному от комментариев тексту
// (scripts/source-text.mjs, он же у других гейтов).
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { stripComments } from './source-text.mjs';

const ROOT = join(import.meta.dirname, '..');
const TARGET_DIR = join(ROOT, 'api', 'src', 'telegram');
const EXCLUDED_SUFFIXES = ['.spec.ts', '.test.ts', '.test-support.ts'];
// Литерал в одинарных, двойных или обратных кавычках на одной строке с
// оборотом «обновите страницу» в любом регистре.
const PAGE_WORD_LITERAL_RE = /(['"`])[^'"`\n]*обновите страницу[^'"`\n]*\1/giu;

function lineAt(src, index) {
  let line = 1;
  for (let i = 0; i < index; i += 1) if (src[i] === '\n') line += 1;
  return line;
}

/** Строковые литералы файла `src` с «обновите страницу» — `{ line, snippet }`
 * каждый; комментарии предварительно вырезаны. */
export function findPageWordLiterals(src) {
  const cleaned = stripComments(src);
  const findings = [];
  for (const m of cleaned.matchAll(PAGE_WORD_LITERAL_RE)) {
    findings.push({ line: lineAt(cleaned, m.index), snippet: m[0] });
  }
  return findings;
}

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (p.endsWith('.ts') && !EXCLUDED_SUFFIXES.some((s) => p.endsWith(s))) yield p;
  }
}

function main() {
  const findings = [];
  let files = 0;
  for (const file of walk(TARGET_DIR)) {
    files += 1;
    for (const found of findPageWordLiterals(readFileSync(file, 'utf8'))) {
      findings.push({ file: relative(ROOT, file), ...found });
    }
  }
  if (findings.length > 0) {
    for (const { file, line, snippet } of findings) {
      console.error(`❌ ${file}:${line}: ${snippet}`);
    }
    console.error(
      '\nв Telegram нечего обновлять — текст бота не говорит «обновите страницу»;\n' +
        'бот-вариант веб-текста кладите рядом с ним в shared (ATTEMPT_NOT_FOUND_BOT_MESSAGE).',
    );
    process.exit(1);
  }
  console.log(`✓ «обновите страницу» в текстах бота не найдено (${files} файлов)`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
