// Тест на парсер check-shared-exports.mjs (CLAUDE.md, храповик «check-shared-
// exports.mjs»): фикстуры — СТРОКИ, а не реальный shared/src/index.ts, иначе
// тест ловит только сегодняшнее содержимое барабана, а не правила разбора.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { barrelExports, barrelViolations } from './check-shared-exports.mjs';

test('barrelExports: переименование `b as c` даёт `c`', () => {
  assert.deepEqual(barrelExports(`export { b as c } from './x';`), ['c']);
});

test('barrelExports: модификатор `type A` у одного имени даёт `A`', () => {
  assert.deepEqual(barrelExports(`export { type A } from './x';`), ['A']);
});

test('barrelViolations: чистый баррель — шапка, одно- и многострочный export from', () => {
  const barrel = `// Шапка-комментарий барабана.
export { A } from './a';
export {
  B,
  C,
} from './b';
`;
  assert.deepEqual(barrelViolations(barrel), []);
});

test('barrelViolations: export const в барабане — нарушение (регрессия: SCHOOL_TZ жил в барабане и был невидим гейту мёртвых экспортов)', () => {
  const barrel = `export { A } from './a';

export const SCHOOL_TZ = 'Asia/Jerusalem';
`;
  assert.deepEqual(barrelViolations(barrel), [
    { text: "export const SCHOOL_TZ = 'Asia/Jerusalem';", star: false },
  ]);
});

test('barrelViolations: объявление типа (не реэкспорт) — нарушение', () => {
  const violations = barrelViolations('export type X = { a: string };');
  assert.deepEqual(violations, [{ text: 'export type X = { a: string };', star: false }]);
});

test('barrelViolations: export * from — нарушение со звёздочным признаком', () => {
  const violations = barrelViolations(`export * from './domain';`);
  assert.deepEqual(violations, [{ text: "export * from './domain';", star: true }]);
});

test('barrelViolations: объявление, закомментированное // или /* */, — не нарушение', () => {
  const barrel = `// export const OLD = 1;
/* export const OLDER = 2; */
export { A } from './a';
`;
  assert.deepEqual(barrelViolations(barrel), []);
});

test('barrelViolations: export { type A, b as c } from — не нарушение', () => {
  assert.deepEqual(barrelViolations(`export { type A, b as c } from './x';`), []);
});
