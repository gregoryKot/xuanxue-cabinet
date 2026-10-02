// Гейт «бот не знает страниц» (F51) на строках-фикстурах, не на реальном дереве.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findPageWordLiterals } from './check-bot-page-word.mjs';

test('литерал с «Обновите страницу» — находка со строкой', () => {
  const src = "const a = 1;\nconst MSG = 'Попытка не найдена. Обновите страницу.';\n";
  assert.deepEqual(findPageWordLiterals(src), [
    { line: 2, snippet: "'Попытка не найдена. Обновите страницу.'" },
  ]);
});

test('оборот в комментарии — не находка', () => {
  const src =
    '// веб говорит «обновите страницу»\nconst page = 1; /* обновите страницу */\n';
  assert.deepEqual(findPageWordLiterals(src), []);
});

test('«Страница 2 из 5» у списка — законно; регистр оборота не важен', () => {
  assert.deepEqual(findPageWordLiterals('const x = `Страница ${p} из ${n}`;'), []);
  assert.equal(findPageWordLiterals('const y = `ОБНОВИТЕ СТРАНИЦУ`;').length, 1);
});
