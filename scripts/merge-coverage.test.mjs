// Тест на mergeCoverage из merge-coverage.mjs (CLAUDE.md, шардинг CI: порог
// покрытия проверяется по склейке шардов, а не по одному куску) — фикстуры
// сырого coverage-final.json (istanbul file-coverage), не реальный прогон
// jest/vitest.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeCoverage } from './merge-coverage.mjs';

// Минимальная валидная structuredCoverage-запись istanbul: один файл, одна
// строка (statement), одна ветка с двумя путями. hits через `s`/`b` — то,
// что реально пишет jest/vitest в coverage-final.json.
function makeFileCoverage({ path, hits, branchHits }) {
  return {
    [path]: {
      path,
      statementMap: {
        0: { start: { line: 1, column: 0 }, end: { line: 1, column: 10 } },
      },
      fnMap: {},
      branchMap: {
        0: {
          type: 'binary-expr',
          locations: [
            { start: { line: 1, column: 0 }, end: { line: 1, column: 5 } },
            { start: { line: 1, column: 6 }, end: { line: 1, column: 10 } },
          ],
        },
      },
      s: { 0: hits },
      f: {},
      b: { 0: branchHits },
    },
  };
}

test('два фрагмента одного файла — хиты statement/branch складываются', () => {
  // Шард А видел строку 0 раз, шард Б — 1 раз: после merge файл покрыт.
  const shardA = makeFileCoverage({
    path: '/repo/src/a.ts',
    hits: 0,
    branchHits: [0, 0],
  });
  const shardB = makeFileCoverage({
    path: '/repo/src/a.ts',
    hits: 1,
    branchHits: [1, 0],
  });

  const summary = mergeCoverage([shardA, shardB]);

  assert.equal(summary['/repo/src/a.ts'].statements.covered, 1);
  assert.equal(summary['/repo/src/a.ts'].statements.total, 1);
  assert.equal(summary['/repo/src/a.ts'].statements.pct, 100);
  // Одна из двух веток покрыта хотя бы одним шардом — суммарно 1 из 2.
  assert.equal(summary['/repo/src/a.ts'].branches.covered, 1);
  assert.equal(summary['/repo/src/a.ts'].branches.total, 2);
  assert.equal(summary.total.statements.covered, 1);
  assert.equal(summary.total.statements.total, 1);
});

test('файлы из разных шардов — оба попадают в итог', () => {
  const shardA = makeFileCoverage({
    path: '/repo/src/a.ts',
    hits: 1,
    branchHits: [1, 1],
  });
  const shardB = makeFileCoverage({
    path: '/repo/src/b.ts',
    hits: 0,
    branchHits: [0, 0],
  });

  const summary = mergeCoverage([shardA, shardB]);

  assert.ok(summary['/repo/src/a.ts']);
  assert.ok(summary['/repo/src/b.ts']);
  assert.equal(summary.total.statements.total, 2);
  assert.equal(summary.total.statements.covered, 1);
  assert.equal(summary.total.statements.pct, 50);
});

test('пустой вход — ошибка, не тихий пустой отчёт', () => {
  assert.throws(() => mergeCoverage([]), /нет входных данных/);
});
