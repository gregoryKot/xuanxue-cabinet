// Тест чистой части git-refs.mjs: разбор списка веток на фикстурах-строках,
// без обращения к git. Обёртки над spawnSync (runGit и то, что зовёт его)
// в юнит-тесте не участвуют — их поведение проверяется приёмкой гейта:
// недоступный remote пропускает кросс-веточную проверку, а не красит CI.
// Правила нумерации ADR живут в adr-claims.mjs и проверяются своим тестом.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseBranchList } from './git-refs.mjs';

test('parseBranchList: origin/HEAD и origin/main не считаются чужими ветками', () => {
  const output = ['origin/HEAD', 'origin/main', 'origin/feature-x'].join('\n');
  assert.deepEqual(parseBranchList(output), ['feature-x']);
});

test('parseBranchList: текущая ветка исключается через exclude', () => {
  const output = ['origin/main', 'origin/feature-x', 'origin/my-branch'].join('\n');
  assert.deepEqual(parseBranchList(output, { exclude: ['my-branch'] }), ['feature-x']);
});

test('parseBranchList: пустые строки и чужой формат строк пропускаются', () => {
  const output = ['origin/main', '', '  ', 'origin/feature-x', 'not-a-remote-ref'].join(
    '\n',
  );
  assert.deepEqual(parseBranchList(output), ['feature-x']);
});

test('parseBranchList: несколько чужих веток сохраняют порядок', () => {
  const output = ['origin/main', 'origin/a', 'origin/b', 'origin/c'].join('\n');
  assert.deepEqual(parseBranchList(output), ['a', 'b', 'c']);
});

test('parseBranchList: пустой вывод — пустой список', () => {
  assert.deepEqual(parseBranchList(''), []);
});
