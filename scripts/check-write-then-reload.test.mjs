// Тест на разбор check-write-then-reload.mjs (CLAUDE.md, храповик
// «check-write-then-reload.mjs», ADR-0087): фикстуры-строки, не реальное
// дерево web/src — иначе тест ловит только сегодняшнее состояние
// репозитория, а не сам разбор (тот же приём, что check-adr-numbers.test.mjs
// и check-route-collisions.test.mjs — см. их шапки).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LOOKAHEAD_LINES,
  findMutatingWriteLines,
  findWriteThenReloadFindings,
  diffAgainstAllowlist,
} from './check-write-then-reload.mjs';

test('findMutatingWriteLines: apiFetch с method: POST — найден', () => {
  const src = "await apiFetch('/x', { method: 'POST', body });";
  assert.deepEqual(findMutatingWriteLines(src), [1]);
});

test('findMutatingWriteLines: явный дженерик apiFetch<void>(...) тоже находится', () => {
  // Реальная форма из welcome/useProfileSetup.ts, auth/useEmailLink.ts.
  const src = "await apiFetch<void>('/me/profile', { method: 'PATCH', body });";
  assert.deepEqual(findMutatingWriteLines(src), [1]);
});

test('findMutatingWriteLines: PUT и DELETE тоже мутирующие методы', () => {
  const put = "await apiFetch('/x', { method: 'PUT', body });";
  const del = "await apiFetch('/x', { method: 'DELETE' });";
  assert.deepEqual(findMutatingWriteLines(put), [1]);
  assert.deepEqual(findMutatingWriteLines(del), [1]);
});

test('findMutatingWriteLines: чистый GET (метод не указан) не находится', () => {
  const src = "apiFetch('/x', { signal });";
  assert.deepEqual(findMutatingWriteLines(src), []);
});

test('findMutatingWriteLines: явный method: GET не находится', () => {
  const src = "apiFetch('/x', { method: 'GET', signal });";
  assert.deepEqual(findMutatingWriteLines(src), []);
});

test('findMutatingWriteLines: номер строки — где начинается apiFetch(', () => {
  const src = [
    'const a = 1;',
    'const b = 2;',
    "apiFetch('/x', { method: 'POST' });",
  ].join('\n');
  assert.deepEqual(findMutatingWriteLines(src), [3]);
});

test('findWriteThenReloadFindings: запись и await reload() сразу следом — находка', () => {
  const src = [
    "await apiFetch('/x', {",
    "  method: 'POST',",
    '  body,',
    '});',
    'await reload();',
  ].join('\n');
  assert.deepEqual(findWriteThenReloadFindings('a.ts', src), [{ file: 'a.ts', line: 1 }]);
});

test('findWriteThenReloadFindings: await refresh() тоже считается находкой', () => {
  const src = "await apiFetch('/x', { method: 'PUT', body });\nawait refresh();";
  assert.deepEqual(findWriteThenReloadFindings('a.ts', src), [{ file: 'a.ts', line: 1 }]);
});

test('findWriteThenReloadFindings: reload() дальше LOOKAHEAD_LINES строк — не находка', () => {
  const filler = Array.from({ length: LOOKAHEAD_LINES }, (_, i) => `// ${i}`);
  const src = [
    "await apiFetch('/x', { method: 'POST' });",
    ...filler,
    'await reload();',
  ].join('\n');
  assert.deepEqual(findWriteThenReloadFindings('a.ts', src), []);
});

test('findWriteThenReloadFindings: reload() ровно на границе LOOKAHEAD_LINES — находка', () => {
  const filler = Array.from({ length: LOOKAHEAD_LINES - 1 }, (_, i) => `// ${i}`);
  const src = [
    "await apiFetch('/x', { method: 'POST' });",
    ...filler,
    'await reload();',
  ].join('\n');
  assert.deepEqual(findWriteThenReloadFindings('a.ts', src), [{ file: 'a.ts', line: 1 }]);
});

test('findWriteThenReloadFindings: чистый GET с await reload() рядом — не находка', () => {
  const src = "const x = await apiFetch('/x', { signal });\nawait reload();";
  assert.deepEqual(findWriteThenReloadFindings('a.ts', src), []);
});

test('findWriteThenReloadFindings: void refresh() без await — не находка', () => {
  const src = "await apiFetch('/x', { method: 'POST' });\nvoid refresh();";
  assert.deepEqual(findWriteThenReloadFindings('a.ts', src), []);
});

test('findWriteThenReloadFindings: запись без всякого перечитывания рядом — не находка', () => {
  const src = "await apiFetch('/x', { method: 'POST', body });\nsetStatus('idle');";
  assert.deepEqual(findWriteThenReloadFindings('a.ts', src), []);
});

test('findWriteThenReloadFindings: два независимых места записи — две находки', () => {
  const src = [
    "await apiFetch('/a', { method: 'POST' });",
    'await reload();',
    'const other = 1;',
    "await apiFetch('/b', { method: 'DELETE' });",
    'await refresh();',
  ].join('\n');
  assert.deepEqual(findWriteThenReloadFindings('a.ts', src), [
    { file: 'a.ts', line: 1 },
    { file: 'a.ts', line: 4 },
  ]);
});

test('diffAgainstAllowlist: найдено столько же, сколько в списке — не проблема', () => {
  const { exceeded, improved } = diffAgainstAllowlist(
    { 'a.ts': 2 },
    { 'a.ts': { count: 2, reason: 'r' } },
  );
  assert.deepEqual(exceeded, []);
  assert.deepEqual(improved, []);
});

test('diffAgainstAllowlist: найдено больше, чем в списке — превышение', () => {
  const { exceeded, improved } = diffAgainstAllowlist(
    { 'a.ts': 3 },
    { 'a.ts': { count: 2, reason: 'r' } },
  );
  assert.deepEqual(exceeded, [{ file: 'a.ts', found: 3, allowed: 2, listed: true }]);
  assert.deepEqual(improved, []);
});

test('diffAgainstAllowlist: находка в файле, которого нет в списке — превышение', () => {
  const { exceeded } = diffAgainstAllowlist({ 'new.ts': 1 }, {});
  assert.deepEqual(exceeded, [{ file: 'new.ts', found: 1, allowed: 0, listed: false }]);
});

test('diffAgainstAllowlist: найдено меньше, чем в списке — можно сократить, не падает', () => {
  const { exceeded, improved } = diffAgainstAllowlist(
    {},
    { 'fixed.ts': { count: 3, reason: 'r' } },
  );
  assert.deepEqual(exceeded, []);
  assert.deepEqual(improved, [{ file: 'fixed.ts', found: 0, allowed: 3 }]);
});
