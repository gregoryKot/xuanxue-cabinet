// Тест на парсер check-card-list-gap.mjs (CLAUDE.md, храповик
// «check-card-list-gap.mjs»): фикстуры-строки, не реальное дерево web/src —
// иначе тест ловит только сегодняшнее состояние репозитория, а не разбор.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  maskLiterals,
  findListLiterals,
  findGaplessLists,
} from './check-card-list-gap.mjs';

test('maskLiterals: сохраняет длину строки', () => {
  const src = `const a = 'x{}y'; // c{}\n/* d{} */ const b = 1;`;
  assert.equal(maskLiterals(src).length, src.length);
});

test('maskLiterals: содержимое строки, // и /* */ затёрто, границы остались', () => {
  const src = "const a = 'secret'; // note\n/* block */";
  const masked = maskLiterals(src);
  assert.equal(masked.length, src.length);
  assert.ok(masked.startsWith("const a = '"));
  assert.ok(!masked.includes('secret'));
  assert.ok(!masked.includes('note'));
  assert.ok(!masked.includes('block'));
  assert.ok(masked.includes('//'));
  assert.ok(masked.includes('/*') && masked.includes('*/'));
});

test('список без gap ловится', () => {
  const src =
    "const listStyle: CSSProperties = { margin: 0, padding: 0, listStyle: 'none' };";
  const offenders = findGaplessLists('a.tsx', src);
  assert.equal(offenders.length, 1);
  assert.equal(offenders[0].name, 'listStyle');
});

test('список с gap проходит', () => {
  const src =
    "const listStyle: CSSProperties = { margin: 0, padding: 0, listStyle: 'none', gap: 10 };";
  assert.deepEqual(findGaplessLists('a.tsx', src), []);
});

test('обёртка «список одной карточкой» с overflow: hidden проходит', () => {
  const src =
    "const oneCardListStyle: CSSProperties = { listStyle: 'none', overflow: 'hidden' };";
  assert.deepEqual(findGaplessLists('a.tsx', src), []);
});

test('gap только в комментарии не считается — список всё равно ловится', () => {
  const src = [
    'const listStyle: CSSProperties = {',
    '  margin: 0,',
    '  padding: 0,',
    '  // gap: 10 — раньше был, убрали',
    "  listStyle: 'none',",
    '};',
  ].join('\n');
  const offenders = findGaplessLists('a.tsx', src);
  assert.equal(offenders.length, 1);
});

test('listStyle: "none" в двойных кавычках ловится', () => {
  const src = 'const listStyle = { margin: 0, padding: 0, listStyle: "none" };';
  assert.equal(findListLiterals(src).length, 1);
});

test('вложенный объект внутри литерала не сбивает парность скобок', () => {
  const src = "const style = { icon: { size: 10 }, listStyle: 'none' };";
  const literals = findListLiterals(src);
  assert.equal(literals.length, 1);
  assert.equal(literals[0].name, 'style');
  assert.equal(literals[0].hasGap, false);
});

test('фигурная скобка внутри строкового литерала не сбивает разбор', () => {
  const src = "const style = { label: '{not a brace}', listStyle: 'none' };";
  const literals = findListLiterals(src);
  assert.equal(literals.length, 1);
  assert.equal(literals[0].name, 'style');
});

test('файл без списков даёт пустой результат', () => {
  assert.deepEqual(findListLiterals('const x = { color: "red" };'), []);
});

test('имя константы попадает в отчёт, а инлайн-объект без имени — null', () => {
  const src = "<ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>{children}</ul>";
  const literals = findListLiterals(src);
  assert.equal(literals.length, 1);
  assert.equal(literals[0].name, null);
});

test('номер строки верный — считается по позиции открывающей { литерала', () => {
  const src = [
    'const A = 1;',
    'const B = 2;',
    'const listStyle: CSSProperties = {',
    '  margin: 0,',
    "  listStyle: 'none',",
    '};',
  ].join('\n');
  const literals = findListLiterals(src);
  assert.equal(literals.length, 1);
  assert.equal(literals[0].line, 3);
});

test('findGaplessLists: имя файла попадает в каждую запись отчёта', () => {
  const src = "const listStyle = { margin: 0, padding: 0, listStyle: 'none' };";
  const offenders = findGaplessLists('web/src/x/Y.tsx', src);
  assert.equal(offenders[0].file, 'web/src/x/Y.tsx');
});
