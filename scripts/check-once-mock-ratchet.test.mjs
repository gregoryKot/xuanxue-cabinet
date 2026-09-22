// Тест на разбор check-once-mock-ratchet.mjs (CLAUDE.md, храповик
// «check-once-mock-ratchet.mjs», инцидент a155bc1 и его повтор 2026-09-22):
// фикстуры-строки, не реальное дерево web/src — иначе тест ловит только
// сегодняшнее состояние репозитория, а не сам разбор (тот же приём, что в
// check-write-then-reload.test.mjs и check-outbound-timeout.test.mjs — см.
// их шапки).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  findApiFetchMockIdentifiers,
  chainRootIdentifier,
  findOnceMockFindings,
  diffByFile,
} from './check-once-mock-ratchet.mjs';

test('findApiFetchMockIdentifiers: mockedApiFetch — есть всегда, даже без объявления в файле', () => {
  assert.deepEqual(
    findApiFetchMockIdentifiers('const x = 1;'),
    new Set(['mockedApiFetch']),
  );
});

test('findApiFetchMockIdentifiers: локальный const под другим именем добавляется', () => {
  const src = 'const fetchMock = vi.mocked(apiFetch);\nfetchMock.mockReset();';
  assert.deepEqual(
    findApiFetchMockIdentifiers(src),
    new Set(['mockedApiFetch', 'fetchMock']),
  );
});

test('chainRootIdentifier: прямой вызов identifier.mockResolvedValueOnce(', () => {
  const src = 'mockedApiFetch.mockResolvedValueOnce(x)';
  const dot = src.indexOf('.mockResolvedValueOnce');
  assert.equal(chainRootIdentifier(src, dot), 'mockedApiFetch');
});

test('chainRootIdentifier: второе звено цепочки раскручивается до того же корня', () => {
  const src = 'mockedApiFetch.mockResolvedValueOnce([A]).mockRejectedValueOnce(b)';
  const dot = src.lastIndexOf('.mockRejectedValueOnce');
  assert.equal(chainRootIdentifier(src, dot), 'mockedApiFetch');
});

test('chainRootIdentifier: корень цепочки — не apiFetch (vi.fn())', () => {
  const src = 'vi.fn().mockResolvedValueOnce(x)';
  const dot = src.lastIndexOf('.mockResolvedValueOnce');
  assert.equal(chainRootIdentifier(src, dot), 'vi');
});

test('findOnceMockFindings: mockResolvedValueOnce на mockedApiFetch — находка', () => {
  const src = "mockedApiFetch.mockResolvedValueOnce({ id: '1' });";
  assert.deepEqual(findOnceMockFindings('a.test.ts', src), [
    { file: 'a.test.ts', line: 1, method: 'mockResolvedValueOnce' },
  ]);
});

test('findOnceMockFindings: mockRejectedValueOnce на mockedApiFetch — находка', () => {
  const src = "mockedApiFetch.mockRejectedValueOnce(new Error('x'));";
  assert.deepEqual(findOnceMockFindings('a.test.ts', src), [
    { file: 'a.test.ts', line: 1, method: 'mockRejectedValueOnce' },
  ]);
});

test('findOnceMockFindings: цепочка из двух заглушек в одну строку — две находки', () => {
  const src = 'mockedApiFetch.mockResolvedValueOnce([A]).mockRejectedValueOnce(b);';
  assert.deepEqual(findOnceMockFindings('a.test.ts', src), [
    { file: 'a.test.ts', line: 1, method: 'mockResolvedValueOnce' },
    { file: 'a.test.ts', line: 1, method: 'mockRejectedValueOnce' },
  ]);
});

test('findOnceMockFindings: цепочка на нескольких строках — номер строки каждого звена свой', () => {
  const src = [
    'mockedApiFetch',
    '  .mockResolvedValueOnce([ATTEMPT])',
    '  .mockRejectedValueOnce(new ApiError("сбой", 0, "network"));',
  ].join('\n');
  assert.deepEqual(findOnceMockFindings('a.test.ts', src), [
    { file: 'a.test.ts', line: 2, method: 'mockResolvedValueOnce' },
    { file: 'a.test.ts', line: 3, method: 'mockRejectedValueOnce' },
  ]);
});

test('findOnceMockFindings: локальный const с другим именем — тоже находится', () => {
  const src = [
    'const fetchMock = vi.mocked(apiFetch);',
    'fetchMock.mockResolvedValueOnce(x);',
  ].join('\n');
  assert.deepEqual(findOnceMockFindings('a.test.ts', src), [
    { file: 'a.test.ts', line: 2, method: 'mockResolvedValueOnce' },
  ]);
});

test('findOnceMockFindings: заглушка на несвязанном vi.fn() — не находка', () => {
  const src = "const load = vi.fn().mockResolvedValueOnce('готово');";
  assert.deepEqual(findOnceMockFindings('a.test.ts', src), []);
});

test('findOnceMockFindings: заглушка на несвязанном vi.fn() внутри vi.stubGlobal — не находка', () => {
  const src =
    "vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(jsonResponse(200, {})));";
  assert.deepEqual(findOnceMockFindings('a.test.ts', src), []);
});

test('findOnceMockFindings: упоминание в комментарии — не находка', () => {
  const src = [
    '// Второй вызов mockApiByPath, не mockedApiFetch.mockRejectedValueOnce: подсказка тегов',
    "mockApiByPath({ '/tags': [] });",
  ].join('\n');
  assert.deepEqual(findOnceMockFindings('a.test.ts', src), []);
});

test('findOnceMockFindings: упоминание в строковом литерале — не находка', () => {
  const src = "const hint = 'mockedApiFetch.mockResolvedValueOnce не тут';";
  assert.deepEqual(findOnceMockFindings('a.test.ts', src), []);
});

test('findOnceMockFindings: mockApiByPath рядом, без …Once — ничего не находит', () => {
  const src = "mockApiByPath({ '/tags': [], '/lessons': [] });";
  assert.deepEqual(findOnceMockFindings('a.test.ts', src), []);
});

test('diffByFile: то же число, что в бейслайне — не проблема', () => {
  const { increased, improved } = diffByFile({ 'a.ts': 2 }, { 'a.ts': 2 });
  assert.deepEqual(increased, []);
  assert.deepEqual(improved, []);
});

test('diffByFile: нашлось больше, чем в бейслайне — рост', () => {
  const { increased, improved } = diffByFile({ 'a.ts': 3 }, { 'a.ts': 2 });
  assert.deepEqual(increased, [{ file: 'a.ts', found: 3, before: 2 }]);
  assert.deepEqual(improved, []);
});

test('diffByFile: новый файл с находками, которого нет в бейслайне — рост', () => {
  const { increased } = diffByFile({ 'new.ts': 1 }, {});
  assert.deepEqual(increased, [{ file: 'new.ts', found: 1, before: 0 }]);
});

test('diffByFile: нашлось меньше, чем в бейслайне — можно сократить, не падает', () => {
  const { increased, improved } = diffByFile({}, { 'fixed.ts': 3 });
  assert.deepEqual(increased, []);
  assert.deepEqual(improved, [{ file: 'fixed.ts', found: 0, before: 3 }]);
});
