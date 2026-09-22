// Тест на разбор check-adr-numbers.mjs: фикстуры-строки, не реальный
// docs/adr — иначе тест ловит сегодняшнее состояние репозитория, а не разбор,
// и зеленеет ровно до следующего ADR.
//
// Случаи взяты с инцидента 2026-09-20 (номер 0059 у двух решений сразу,
// решение без строки в оглавлении, ссылка на переименованный файл).
//
// Тесты на кросс-веточную часть (findCrossBranchCollisions, firstFreeNumber,
// инцидент 2026-09-22 с ADR-0106) — в adr-claims.test.mjs, рядом с функциями:
// эти функции живут там же, не здесь (check-adr-numbers.mjs — на потолке в
// 150 строк, CLAUDE.md, «Храповики»).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseAdrFileName,
  findDuplicateNumbers,
  headingNumber,
  parseIndexRows,
  findDeadLinks,
} from './check-adr-numbers.mjs';

test('parseAdrFileName: имя по схеме — номер и слаг', () => {
  assert.deepEqual(parseAdrFileName('0075-lesson-tags-and-tag-screen.md'), {
    number: '0075',
    slug: 'lesson-tags-and-tag-screen',
  });
});

test('parseAdrFileName: три цифры — не номер ADR', () => {
  assert.equal(parseAdrFileName('075-lesson-tags.md'), null);
});

test('parseAdrFileName: заглавные буквы ломают ссылку на macOS — не имя', () => {
  assert.equal(parseAdrFileName('0075-Lesson-Tags.md'), null);
});

test('parseAdrFileName: README.md именем ADR не считается', () => {
  assert.equal(parseAdrFileName('README.md'), null);
});

test('findDuplicateNumbers: один номер у двух решений (инцидент 0059)', () => {
  const adrs = [
    { number: '0059', file: '0059-second-login-key.md' },
    { number: '0059', file: '0059-lesson-tags-and-tag-screen.md' },
    { number: '0060', file: '0060-viewer-timezone.md' },
  ];
  assert.deepEqual(findDuplicateNumbers(adrs), {
    '0059': ['0059-lesson-tags-and-tag-screen.md', '0059-second-login-key.md'],
  });
});

test('findDuplicateNumbers: все номера свои — пусто', () => {
  const adrs = [
    { number: '0074', file: '0074-a.md' },
    { number: '0075', file: '0075-b.md' },
  ];
  assert.deepEqual(findDuplicateNumbers(adrs), {});
});

test('headingNumber: номер из первой непустой строки', () => {
  assert.equal(headingNumber('# 0075. Тег живёт и у даты занятия\n\nДата: …'), '0075');
});

test('headingNumber: пустые строки сверху пропускаются', () => {
  assert.equal(headingNumber('\n\n# 0075. Название\n'), '0075');
});

test('headingNumber: заголовок не переименовали вслед за файлом', () => {
  assert.equal(headingNumber('# 0059. Тег живёт и у даты занятия\n'), '0059');
});

test('headingNumber: заголовка нужного вида нет — null', () => {
  assert.equal(headingNumber('Дата: 2026-09-20. Статус: принято.\n'), null);
});

test('parseIndexRows: номер и цель каждой строки таблицы', () => {
  const src = [
    '| №      | Решение    |',
    '| ------ | ---------- |',
    '| [0074](0074-new-tasks-count-only-for-student.md) | Новые задания |',
    '| [0075](0075-lesson-tags-and-tag-screen.md)       | Тег у даты    |',
  ].join('\n');
  assert.deepEqual(parseIndexRows(src), [
    { number: '0074', target: '0074-new-tasks-count-only-for-student.md' },
    { number: '0075', target: '0075-lesson-tags-and-tag-screen.md' },
  ]);
});

test('parseIndexRows: ссылка вне таблицы строкой оглавления не считается', () => {
  assert.deepEqual(parseIndexRows('См. [0075](0075-lesson-tags.md) в тексте.\n'), []);
});

test('findDeadLinks: ссылка на переименованный файл (инцидент ADR-0072)', () => {
  const src =
    'Уточняет [ADR-0059](0059-lesson-tags-and-tag-screen.md), остальное в силе.';
  assert.deepEqual(findDeadLinks(src, ['0075-lesson-tags-and-tag-screen.md']), [
    '0059-lesson-tags-and-tag-screen.md',
  ]);
});

test('findDeadLinks: ссылка на существующий файл — не битая', () => {
  const src = 'Уточняет [ADR-0058](0058-material-tags-are-rubrication.md).';
  assert.deepEqual(findDeadLinks(src, ['0058-material-tags-are-rubrication.md']), []);
});

test('findDeadLinks: форма ./NNNN-slug.md разбирается тоже', () => {
  assert.deepEqual(findDeadLinks('[x](./0059-lesson-tags.md)', ['0075-lesson-tags.md']), [
    '0059-lesson-tags.md',
  ]);
});

test('findDeadLinks: ссылки не на ADR не трогаются', () => {
  const src = '[VOICE](../VOICE.md) и [план](../PLAN.md)';
  assert.deepEqual(findDeadLinks(src, []), []);
});
