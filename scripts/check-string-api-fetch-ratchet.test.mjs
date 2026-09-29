// Тест на разбор check-string-api-fetch-ratchet.mjs (PLAN §17.1): фикстуры-
// строки, не реальное дерево web/src — иначе тест ловит только сегодняшнее
// состояние репозитория, а не сам разбор (тот же приём, что в
// check-once-mock-ratchet.test.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  skipGenerics,
  findStringApiFetchCalls,
} from './check-string-api-fetch-ratchet.mjs';
import { isBridgeFile } from './string-api-fetch-bridges.mjs';

const lines = (src) => findStringApiFetchCalls('f.ts', src).map((f) => f.line);

test('skipGenerics: вложенные <> закрываются на своей паре', () => {
  const src = '<Array<X>>(';
  assert.equal(skipGenerics(src, 0), src.length - 1);
});

test('skipGenerics: стрелка => не закрывает скобку', () => {
  const src = '<() => void>(';
  assert.equal(skipGenerics(src, 0), src.length - 1);
});

test('skipGenerics: нет пары — -1', () => {
  assert.equal(skipGenerics('<Array<X>', 0), -1);
});

test('простой вызов считается', () => {
  assert.deepEqual(lines("const x = await apiFetch('/a');"), [1]);
});

test('вызов с generic и вложенными <> считается', () => {
  assert.deepEqual(lines("apiFetch<Array<X>>('/a');"), [1]);
});

test('многострочный вызов: строка — где имя, пробел перед ( и generic допустимы', () => {
  const src = "const a = 1;\nawait apiFetch<Foo>\n  (\n  '/a',\n);";
  assert.deepEqual(lines(src), [2]);
});

test('упоминание в комментарии и в строке не считается', () => {
  const src = "// apiFetch('/a')\n/* apiFetch<T>('/b') */\nconst s = \"apiFetch('/c')\";";
  assert.deepEqual(lines(src), []);
});

test('объявление function apiFetch<T>( не считается', () => {
  assert.deepEqual(lines('export async function apiFetch<T>(path: string) {}'), []);
});

test('import и export без вызова не считаются', () => {
  const src = "import { apiFetch } from './http';\nexport { apiFetch };";
  assert.deepEqual(lines(src), []);
});

test('mockedApiFetch( и x.apiFetch( не считаются', () => {
  const src = 'mockedApiFetch(1);\nclient.apiFetch(2);\nmyapiFetch(3);\napiFetchAll(4);';
  assert.deepEqual(lines(src), []);
});

test('ссылка на apiFetch без вызова не считается', () => {
  assert.deepEqual(lines('const f = apiFetch;\nvi.mocked(apiFetch);'), []);
});

test('несколько вызовов в файле — по строке на каждый', () => {
  assert.deepEqual(lines("apiFetch('/a');\n\napiFetch<T>('/b');"), [1, 3]);
});

test('мосты: apiRoute.ts и prefetchFirstScreen.ts не считаются, остальные файлы — да', () => {
  assert.equal(isBridgeFile('web/src/api/apiRoute.ts'), true);
  assert.equal(isBridgeFile('web/src/app/prefetchFirstScreen.ts'), true);
  assert.equal(isBridgeFile('web/src/people/usePeople.ts'), false);
});
