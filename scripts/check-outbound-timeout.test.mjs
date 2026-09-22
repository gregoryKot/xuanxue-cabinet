// Тест на парсер check-outbound-timeout.mjs (CLAUDE.md, храповик
// «check-outbound-timeout.mjs»): фикстуры-строки, не реальное дерево
// api/src или web/src — иначе тест ловит только сегодняшнее состояние
// репозитория, а не разбор (тот же приём, что в
// check-route-collisions.test.mjs). Сам сканер литералов проверяется
// отдельно — scripts/source-text.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findFetchesWithoutSignal } from './check-outbound-timeout.mjs';

test('findFetchesWithoutSignal: signal: AbortSignal.timeout(X) — чисто', () => {
  const src = `fetch(url, { signal: AbortSignal.timeout(3000) });`;
  assert.deepEqual(findFetchesWithoutSignal(src), []);
});

test('findFetchesWithoutSignal: fetch(url) одним аргументом — находка', () => {
  const src = `fetch(url);`;
  const found = findFetchesWithoutSignal(src);
  assert.equal(found.length, 1);
  assert.equal(found[0].line, 1);
});

test('findFetchesWithoutSignal: options без signal — находка', () => {
  const src = `fetch(url, { method: 'POST' });`;
  assert.equal(findFetchesWithoutSignal(src).length, 1);
});

test('findFetchesWithoutSignal: шаблонный литерал со скобками не ломает парсер', () => {
  const src = 'fetch(`${base}/path?a=(b)`, { signal });';
  assert.deepEqual(findFetchesWithoutSignal(src), []);
});

test('findFetchesWithoutSignal: "signal:" внутри строкового литерала не в счёт', () => {
  const src = `fetch(url, { method: 'signal: not-really' });`;
  const found = findFetchesWithoutSignal(src);
  assert.equal(found.length, 1);
});

test('findFetchesWithoutSignal: this.fetchPage(/safeFetch(/prefetch( — не вызовы fetch', () => {
  const src = [
    `this.fetchPage(url);`,
    `safeFetch(url);`,
    `prefetch(url);`,
    `obj.fetch(url);`,
  ].join('\n');
  assert.deepEqual(findFetchesWithoutSignal(src), []);
});

test('findFetchesWithoutSignal: закомментированный fetch(url) — не находка', () => {
  const src = `// fetch(url)\nconst z = 1;`;
  assert.deepEqual(findFetchesWithoutSignal(src), []);
});

test('findFetchesWithoutSignal: многострочный вызов — строка указывает на fetch(', () => {
  const src = ['const res = await fetch(', '  url,', '  { method: "GET" },', ');'].join(
    '\n',
  );
  const found = findFetchesWithoutSignal(src);
  assert.equal(found.length, 1);
  assert.equal(found[0].line, 1);
});

test('findFetchesWithoutSignal: await fetch(...) с signal — чисто', () => {
  const src = `async function f() {\n  await fetch(url, { signal });\n}`;
  assert.deepEqual(findFetchesWithoutSignal(src), []);
});
