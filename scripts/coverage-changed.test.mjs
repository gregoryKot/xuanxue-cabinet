// Разбор для `npm run coverage:changed` — на строках-фикстурах, без git и jest:
// проверяем именно арифметику строк (хунки, хиты, пересечение), а не окружение.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'module';
import { join } from 'path';
import {
  filterCollectable,
  formatRanges,
  lineHits,
  parseDiffHunks,
  uncoveredChangedLines,
} from './coverage-changed.mjs';

const DIFF = [
  'diff --git a/api/src/a.ts b/api/src/a.ts',
  '--- a/api/src/a.ts',
  '+++ b/api/src/a.ts',
  '@@ -3 +3 @@',
  '-old',
  '+new',
  '@@ -10,0 +11,3 @@ function x() {',
  '+one',
  '+two',
  '+three',
  '@@ -20,2 +25,0 @@',
  '-gone1',
  '-gone2',
  'diff --git a/api/src/b.ts b/api/src/b.ts',
  '--- a/api/src/b.ts',
  '+++ b/api/src/b.ts',
  '@@ -1,2 +1,2 @@',
  '-x',
  '-y',
  '+++ not a header, just an added line',
  '+z',
  '',
].join('\n');

test('parseDiffHunks: хунки с счётчиком и без него, несколько файлов в одном diff', () => {
  const result = parseDiffHunks(DIFF);
  assert.deepEqual([...result.keys()], ['api/src/a.ts', 'api/src/b.ts']);
  assert.deepEqual(result.get('api/src/a.ts'), [3, 11, 12, 13]);
  assert.deepEqual(result.get('api/src/b.ts'), [1, 2]);
});

test('parseDiffHunks: хунк только с удалением (d=0) строк не добавляет', () => {
  const diff = [
    '--- a/api/src/c.ts',
    '+++ b/api/src/c.ts',
    '@@ -5,2 +4,0 @@',
    '-a',
    '-b',
    '',
  ];
  assert.deepEqual(parseDiffHunks(diff.join('\n')).get('api/src/c.ts'), []);
});

test('parseDiffHunks: удалённый файл (+++ /dev/null) пропускается', () => {
  const diff = ['--- a/api/src/d.ts', '+++ /dev/null', '@@ -1,2 +0,0 @@', '-a', '-b', ''];
  assert.equal(parseDiffHunks(diff.join('\n')).size, 0);
});

const pos = (line) => ({ start: { line, column: 0 }, end: { line, column: 1 } });

test('lineHits: на строке несколько операторов — берётся максимум; строки без операторов не попадают', () => {
  const coverage = {
    statementMap: { 0: pos(4), 1: pos(4), 2: pos(7) },
    s: { 0: 0, 1: 3, 2: 0 },
  };
  assert.deepEqual(
    [...lineHits(coverage)],
    [
      [4, 3],
      [7, 0],
    ],
  );
});

test('uncoveredChangedLines: изменённые ∩ строки с нулём хитов, остальное не считается', () => {
  const hits = new Map([
    [10, 0],
    [11, 5],
    [12, 0],
    [40, 0],
  ]);
  const changed = new Map([['api/src/a.ts', [9, 10, 11, 12, 12, 13]]]);
  const result = uncoveredChangedLines(changed, new Map([['api/src/a.ts', hits]]));
  // 9 и 13 — без операторов, 40 — старый непокрытый код вне диффа.
  assert.deepEqual(result.get('api/src/a.ts'), [10, 12]);
});

test('uncoveredChangedLines: всё покрыто → пусто', () => {
  const changed = new Map([['api/src/a.ts', [1, 2]]]);
  const hits = new Map([
    [
      'api/src/a.ts',
      new Map([
        [1, 1],
        [2, 2],
      ]),
    ],
  ]);
  assert.equal(uncoveredChangedLines(changed, hits).size, 0);
});

test('formatRanges: одиночные строки и диапазоны через тире', () => {
  assert.equal(formatRanges([12, 15, 16, 17, 18]), '12, 15–18');
  assert.equal(formatRanges([1, 2, 4]), '1–2, 4');
  assert.equal(formatRanges([7]), '7');
  assert.equal(formatRanges([]), '');
});

test('filterCollectable: как collectCoverageFrom в api/jest.config.js', () => {
  const patterns = createRequire(import.meta.url)(
    join(import.meta.dirname, '..', 'api', 'jest.config.js'),
  ).collectCoverageFrom;
  const files = [
    'api/src/wiki-entry/wiki-entry.ts',
    'api/src/a/deep/b.ts',
    'api/src/a/b.spec.ts',
    'api/src/main.ts',
    'api/src/app.setup.ts',
    'api/src/users/users.module.ts',
    'api/src/seed/seed-classes.ts',
    'api/src/seed/seed-exam.ts',
    'api/src/seed/seed.service.ts',
    'api/test/e2e-support/x.ts',
    'web/src/x.ts',
    'scripts/x.mjs',
  ];
  assert.deepEqual(filterCollectable(files, patterns), [
    'api/src/wiki-entry/wiki-entry.ts',
    'api/src/a/deep/b.ts',
    'api/src/seed/seed.service.ts',
  ]);
});

test('filterCollectable: `**/` допускает и ноль каталогов, `*` не пересекает `/`', () => {
  const patterns = ['src/**/*.ts', '!src/**/*.spec.ts'];
  assert.deepEqual(
    filterCollectable(
      ['api/src/top.ts', 'api/src/x/y.ts', 'api/src/x.spec.ts'],
      patterns,
    ),
    ['api/src/top.ts', 'api/src/x/y.ts'],
  );
  assert.deepEqual(filterCollectable(['api/src/x/y.ts'], ['src/*.ts']), []);
});
