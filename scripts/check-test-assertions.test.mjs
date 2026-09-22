// Тест на парсер check-test-assertions.mjs (CLAUDE.md, храповик
// «check-test-assertions.mjs»): фикстуры-строки, не реальное дерево — ловим
// именно то, ради чего нужен общий сканер scripts/source-text.mjs: скобки
// в названии теста, шаблонные строки, регулярки, комментарии и .only/.skip
// внутри литералов. Сам сканер проверяется отдельно — source-text.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  findDisabledTests,
  findTestsWithoutAssertions,
} from './check-test-assertions.mjs';

test('findDisabledTests: only-семейство — сфокусированные находки', () => {
  const src = [
    "describe.only('группа', () => {});",
    "it.only('первый', () => {});",
    "fit('второй', () => {});",
    "fdescribe('группа2', () => {});",
  ].join('\n');
  const found = findDisabledTests(src).map((f) => f.name);
  assert.equal(found.length, 4);
  assert.equal(
    found.some((n) => n.includes('первый')),
    true,
  );
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

test('findTestsWithoutAssertions: .rejects/.resolves/toHaveBeenCalled сами по себе', () => {
  const bodies = ['return p.rejects;', 'return p.resolves;', 'spy.toHaveBeenCalled();'];
  for (const body of bodies) {
    const src = `it('x', () => {\n  ${body}\n});`;
    assert.deepEqual(findTestsWithoutAssertions(src), []);
  }
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

test('findTestsWithoutAssertions: .test( в it.each — не отдельный вызов test()', () => {
  // Регрессия: shared/src/invite-link.spec.ts — RE.test(value) внутри
  // it.each(...)(...) читался как бестелесный test(value), «без утверждения».
  const src =
    "it.each([1, 2])('%s', (value) => {\n" +
    '  expect(RE.test(value)).toBe(false);\n' +
    '});';
  assert.deepEqual(findTestsWithoutAssertions(src), []);
});

test('findTestsWithoutAssertions: вложенный it() внутри тела не роняет парсер', () => {
  const src =
    "it('внешний', () => {\n" +
    "  it('внутренний', () => { expect(1).toBe(1); });\n" +
    '});';
  assert.doesNotThrow(() => findTestsWithoutAssertions(src));
});
