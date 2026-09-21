// Тест на сверку «знак школы везде один» (docs/adr/0084; вызывается из
// scripts/check-pwa.mjs): фикстуры-строки и объекты, не реальные файлы
// репозитория — как в scripts/pwa-shell-colors.test.mjs, по той же причине:
// сверка должна ловить расхождение, а не запоминать сегодняшние байты.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findIconSourceProblems, REGENERATE_HINT } from './pwa-icon-sources.mjs';

const PAPER = '#f4f1ea';
const SHA = 'a'.repeat(64);
const OTHER_SHA = 'b'.repeat(64);

// Три файла из семи достаточно, чтобы проверить сверку по списку — остальные
// четыре добавили бы шума без нового поведения.
const OUTPUTS = [
  'icons/school-mark-512.png',
  'icons/school-mark-64.png',
  'icons/favicon-32.png',
];
const FILES = ['school-mark-512.png', 'school-mark-64.png', 'favicon-32.png'];

const good = (over = {}) => ({
  css: `:root {\n  --paper: ${PAPER};\n  --terracotta: #b35a38;\n}`,
  sourceExists: true,
  sourceSha256: SHA,
  baseline: {
    source: 'web/brand/school-mark.webp',
    sourceSha256: SHA,
    background: PAPER,
    outputs: OUTPUTS,
  },
  publicIconFiles: [...FILES],
  distIconFiles: [...FILES],
  schoolMarkTsx: '<img src="/icons/school-mark-64.png" alt="" />',
  ...over,
});

test('источник, бейслайн, иконки и компонент совпадают — расхождений нет', () => {
  assert.deepEqual(findIconSourceProblems(good()), []);
});

test('источника нет — одна жалоба, дальше не проверяем', () => {
  assert.deepEqual(
    findIconSourceProblems(good({ sourceExists: false, baseline: null })),
    ['web/brand/school-mark.webp не найден — знак нечем собрать'],
  );
});

test('бейслайн не читается — жалоба с подсказкой перегенерировать', () => {
  assert.deepEqual(findIconSourceProblems(good({ baseline: null })), [
    `scripts/pwa-icons-baseline.json не читается — собери иконки: ${REGENERATE_HINT}`,
  ]);
});

test('источник поменяли, а иконки — нет: sha256 разошёлся', () => {
  assert.deepEqual(findIconSourceProblems(good({ sourceSha256: OTHER_SHA })), [
    'web/brand/school-mark.webp изменился, а иконки — нет: sha256 не совпадает с ' +
      `бейслайном. Перегенерируй: ${REGENERATE_HINT}`,
  ]);
});

test('фон в бейслайне отстал от токена --paper', () => {
  const baseline = { ...good().baseline, background: '#111111' };
  assert.deepEqual(findIconSourceProblems(good({ baseline })), [
    `фон иконок в бейслайне (#111111) разошёлся с токеном --paper (${PAPER}). ` +
      `Перегенерируй: ${REGENERATE_HINT}`,
  ]);
});

test('токена --paper в css нет — жалоба вместо сверки фона', () => {
  assert.deepEqual(findIconSourceProblems(good({ css: ':root { --ink: #24281f; }' })), [
    'в web/src/index.css не нашёлся токен --paper',
  ]);
});

test('файла из бейслайна нет в web/public/icons', () => {
  const publicIconFiles = FILES.filter((f) => f !== 'favicon-32.png');
  assert.deepEqual(findIconSourceProblems(good({ publicIconFiles })), [
    `icons/favicon-32.png из бейслайна нет в web/public/icons. ${REGENERATE_HINT}`,
  ]);
});

test('файл из бейслайна не попал в собранный web/dist', () => {
  const distIconFiles = FILES.filter((f) => f !== 'school-mark-512.png');
  assert.deepEqual(findIconSourceProblems(good({ distIconFiles })), [
    'icons/school-mark-512.png не попал в сборку web/dist — собери web заново',
  ]);
});

test('SchoolMark.tsx не ссылается ни на один файл из иконок', () => {
  const schoolMarkTsx =
    'export function SchoolMark() { return <span aria-hidden="true" />; }';
  assert.deepEqual(findIconSourceProblems(good({ schoolMarkTsx })), [
    'web/src/components/SchoolMark.tsx не ссылается на файл из web/public/icons — ' +
      'знак в интерфейсе не из общего источника',
  ]);
});

test('SchoolMark.tsx ссылается на путь не из outputs бейслайна', () => {
  const schoolMarkTsx = '<img src="/icons/school-mark-999.png" alt="" />';
  assert.deepEqual(findIconSourceProblems(good({ schoolMarkTsx })), [
    'web/src/components/SchoolMark.tsx ссылается на icons/school-mark-999.png, ' +
      `которого нет среди outputs бейслайна — ${REGENERATE_HINT}, затем поправь путь в SchoolMark.tsx`,
  ]);
});
