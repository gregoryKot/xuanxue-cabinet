// Тест на парсер check-test-assertions.mjs (CLAUDE.md, храповик
// «check-test-assertions.mjs»): фикстуры-строки, не реальное дерево — ловим
// именно то, ради чего написан stripLiterals: скобки в названии теста,
// шаблонные строки, регулярки, комментарии и .only/.skip внутри литералов.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  stripLiterals,
  findDisabledTests,
  findTestsWithoutAssertions,
} from './check-test-assertions.mjs';

test('stripLiterals: строка и комментарий гасятся, длина и \\n сохраняются', () => {
  const src = "const s = 'a ( b'; // it.skip(\n";
  const cleaned = stripLiterals(src);
  assert.equal(cleaned.length, src.length);
  assert.equal(cleaned.includes('('), false);
  assert.equal(cleaned.includes('it.skip'), false);
  assert.equal(cleaned.endsWith('\n'), true);
});

test('stripLiterals: блочный комментарий на несколько строк — переносы на месте', () => {
  const src = '/* line1\nline2 ( */\ncode();';
  const cleaned = stripLiterals(src);
  const lines = cleaned.split('\n');
  assert.equal(lines.length, src.split('\n').length);
  assert.equal(lines[1].trim(), '');
  assert.equal(lines[2], 'code();');
});

test('stripLiterals: шаблонный литерал с ${} и скобками гасится целиком', () => {
  const src = 'const msg = `total: ${a + b} (ok)`;';
  const cleaned = stripLiterals(src);
  assert.equal(cleaned.length, src.length);
  assert.equal(cleaned.includes('('), false);
  assert.equal(cleaned.includes('${'), false);
});

test('findDisabledTests: only-семейство — сфокусированные находки', () => {
  const src = [
    "describe.only('группа', () => {});",
    "it.only('первый', () => {});",
    "fit('второй', () => {});",
    "fdescribe('группа2', () => {});",
  ].join('\n');
  const found = findDisabledTests(src).map((f) => f.name);
  assert.equal(found.length, 4);
  assert.equal(found.some((n) => n.includes('первый')), true);
});

test('findDisabledTests: skip/todo-семейство — выключенные находки', () => {
  const src = [
    "it.skip('раз', () => {});",
    "test.skip('два', () => {});",
    "xit('три', () => {});",
    "xdescribe('группа', () => {});",
    "it.todo('четыре');",
    "test.todo('пять');",
  ].join('\n');
  const found = findDisabledTests(src);
  assert.equal(found.length, 6);
  assert.equal(found[0].line, 1);
});

test('findDisabledTests: закомментированный it.only и it.skip в строке — не находки', () => {
  const src = [
    "// it.only('was here', () => {});",
    "const label = 'нужно почистить it.skip позже';",
    "it('обычный тест', () => { expect(1).toBe(1); });",
  ].join('\n');
  assert.deepEqual(findDisabledTests(src), []);
});

test('findTestsWithoutAssertions: пустое тело — находка с именем и строкой', () => {
  const src = "\nit('ничего не проверяет', () => {\n  doSomething();\n});\n";
  const found = findTestsWithoutAssertions(src);
  assert.equal(found.length, 1);
  assert.equal(found[0].name, 'ничего не проверяет');
  assert.equal(found[0].line, 2);
});

test('findTestsWithoutAssertions: скобка в названии не путает границу тела', () => {
  const src = "it('текст со скобкой ( в названии', () => {\n  expect(1).toBe(1);\n});";
  assert.deepEqual(findTestsWithoutAssertions(src), []);
});

test('findTestsWithoutAssertions: шаблонная строка с ${} и скобками не мешает', () => {
  const src =
    "it('renders', () => {\n" +
    '  const msg = `total: ${a + b} (ok)`;\n' +
    '  expect(msg).toBe(`total: ${5} (ok)`);\n' +
    '});';
  assert.deepEqual(findTestsWithoutAssertions(src), []);
});

test('findTestsWithoutAssertions: регулярка со скобками не мешает найти expect', () => {
  const src =
    "it('validates format', () => {\n" +
    '  expect(value).toMatch(/^\\(\\d+\\)$/);\n' +
    '});';
  assert.deepEqual(findTestsWithoutAssertions(src), []);
});

test('findTestsWithoutAssertions: assert.deepEqual (node:assert) — распознаётся', () => {
  const src = "test('через node:assert', () => {\n  assert.deepEqual(a, b);\n});";
  assert.deepEqual(findTestsWithoutAssertions(src), []);
});

test('findTestsWithoutAssertions: .rejects и .resolves сами по себе — распознаются', () => {
  const rejects = "it('падает', () => {\n  return p.rejects;\n});";
  const resolves = "it('ждёт', () => {\n  return p.resolves;\n});";
  assert.deepEqual(findTestsWithoutAssertions(rejects), []);
  assert.deepEqual(findTestsWithoutAssertions(resolves), []);
});

test('findTestsWithoutAssertions: toHaveBeenCalled сам по себе — распознаётся', () => {
  const src = "it('вызывает колбэк', () => {\n  spy.toHaveBeenCalled();\n});";
  assert.deepEqual(findTestsWithoutAssertions(src), []);
});

test('findTestsWithoutAssertions: утверждение только в комментарии — находка', () => {
  const src =
    "it('якобы проверяет', () => {\n" +
    '  // expect(result).toBe(true);\n' +
    '  doSomething();\n' +
    '});';
  const found = findTestsWithoutAssertions(src);
  assert.equal(found.length, 1);
  assert.equal(found[0].name, 'якобы проверяет');
});

test('findTestsWithoutAssertions: вложенный it() внутри тела не роняет парсер', () => {
  const src =
    "it('внешний', () => {\n" +
    "  it('внутренний', () => { expect(1).toBe(1); });\n" +
    '});';
  assert.doesNotThrow(() => findTestsWithoutAssertions(src));
});
