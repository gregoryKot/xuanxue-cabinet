#!/usr/bin/env node
// Детектор тест-иллюзий: тест выполняется, покрытие растёт, а проверяет
// ноль — либо в теле нет утверждения, либо тест выключен (it.skip) или файл
// сведён к одному случаю (it.only). Coverage-храповики считают строки, не
// утверждения. CLAUDE.md, «Любой код с логикой приезжает с тестом»:
// «мигающий тест чинится или удаляется в тот же день» — гейт делает это
// механизмом, не памятью.
//
// Разбор — чистые функции (findDisabledTests, findTestsWithoutAssertions)
// без fs поверх общего сканера scripts/source-text.mjs: он гасит строки и
// комментарии, чтобы `it.skip` внутри литерала не читался как код.
// check-test-assertions.test.mjs гоняет их на строках-фикстурах, не на дереве.
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { stripLiterals } from './source-text.mjs';

const SUFFIXES = ['.e2e-spec.ts', '.spec.ts', '.test.tsx', '.test.ts'];
const SCAN_DIRS = ['api/src', 'api/test', 'web/src', 'shared/src'];

const DISABLED_PATTERN =
  /\b(?:describe|it|test)\.(?:only|skip|todo)\(|\bfit\(|\bfdescribe\(|\bxit\(|\bxdescribe\(/g;

// assert…( допускает цепочку через точку (assert.equal(, deepEqual( — так
// вызывает node:assert этот файл сам); expect…( — нет: expect(x) уже вызов,
// .toBe(y) идёт по цепочке после закрывающей скобки, не до неё.
const ASSERTION_PATTERN =
  /\bexpect\w*\s*\(|\bassert(?:\.\w+)*\s*\(|\.rejects\b|\.resolves\b|toHaveBeenCalled/;

// Первая строковая литера после открывающей скобки вызова, в ОРИГИНАЛЕ (в
// очищенном тексте она уже пробелы). null — аргумент не строка.
function extractName(src, argStart) {
  const m = /^\s*(['"`])((?:\\.|(?!\1)[\s\S])*)\1/.exec(src.slice(argStart));
  return m ? m[2] : null;
}

const lineOf = (text, index) => text.slice(0, index).split('\n').length;

// Скобка, парная открывающей на openIndex, в уже очищенном тексте. -1 — файл
// обрывается раньше (не должно случаться, но не повод падать).
function findMatchingParen(text, openIndex) {
  let depth = 0;
  for (let i = openIndex; i < text.length; i++) {
    if (text[i] === '(') depth++;
    else if (text[i] === ')' && --depth === 0) return i;
  }
  return -1;
}

/** `.only`/`fit(`/`fdescribe(` — файл проверяет один случай, а выглядит как
 * полный; `.skip`/`xit(`/`xdescribe(`/`.todo` — выключенная проверка с
 * зелёным CI. Оба одинаково прячут дыру — один список находок. */
export function findDisabledTests(src) {
  const cleaned = stripLiterals(src);
  const results = [];
  for (const m of cleaned.matchAll(DISABLED_PATTERN)) {
    const keyword = m[0].slice(0, -1);
    const testName = extractName(src, m.index + m[0].length);
    results.push({
      line: lineOf(cleaned, m.index),
      name: testName ? `${keyword}: ${testName}` : keyword,
    });
  }
  return results;
}

/** Тело каждого it(...)/test(...) (не .only/.skip/.todo — те находка сама по
 * себе) обязано содержать признак утверждения. Пусто — тест выполнится,
 * покрытие вырастет, а проверит ноль: главная «test illusion» из аудита. */
export function findTestsWithoutAssertions(src) {
  const cleaned = stripLiterals(src);
  const results = [];
  // (?<!\.) — иначе RegExp.prototype.test (`RE.test(value)`) в теле
  // it.each(...)(...) читается как отдельный вызов test(...) (найдено на
  // shared/src/invite-link.spec.ts: ложная находка на .test(value)).
  const pattern = /(?<!\.)\b(?:it|test)\(/g;
  let m;
  while ((m = pattern.exec(cleaned))) {
    const openIndex = m.index + m[0].length - 1;
    const closeIndex = findMatchingParen(cleaned, openIndex);
    if (closeIndex === -1) continue;
    const body = cleaned.slice(openIndex + 1, closeIndex);
    if (!ASSERTION_PATTERN.test(body)) {
      results.push({
        line: lineOf(cleaned, m.index),
        name: extractName(src, openIndex + 1) ?? '(без названия)',
      });
    }
    // Возобновляем после конца вызова: вложенный it() внутри тела (в
    // репозитории такого нет) не должен уронить парсер повторным разбором.
    pattern.lastIndex = closeIndex;
  }
  return results;
}

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (SUFFIXES.some((s) => p.endsWith(s))) yield p;
  }
}

function main() {
  const ROOT = join(import.meta.dirname, '..');
  let fileCount = 0;
  let testCount = 0;
  const findings = [];
  for (const dir of SCAN_DIRS) {
    const abs = join(ROOT, dir);
    if (!existsSync(abs)) continue;
    for (const file of walk(abs)) {
      fileCount++;
      const label = relative(ROOT, file);
      const src = readFileSync(file, 'utf8');
      testCount += stripLiterals(src).match(/(?<!\.)\b(?:it|test)\(/g)?.length ?? 0;
      for (const { line, name } of findDisabledTests(src)) {
        findings.push(`${label}:${line} — отключён или сфокусирован: ${name}`);
      }
      for (const { line, name } of findTestsWithoutAssertions(src)) {
        findings.push(`${label}:${line} — нет утверждения: ${name}`);
      }
    }
  }

  if (findings.length > 0) {
    console.error(
      '❌ тест-иллюзии (CLAUDE.md, «Любой код с логикой приезжает с тестом»):',
    );
    for (const f of findings) console.error(`   ${f}`);
    process.exit(1);
  }
  console.log(`✓ утверждения на месте (${fileCount} файлов, ${testCount} тестов)`);
}

// Запуск как самостоятельный скрипт — не при импорте из теста.
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
