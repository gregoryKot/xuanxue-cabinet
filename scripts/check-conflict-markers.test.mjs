// Тест на разбор check-conflict-markers.mjs: фикстуры-строки, не дерево
// репозитория. Маркеры собираются через repeat(), чтобы гейт не находил
// этот файл.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findConflictMarkers } from './check-conflict-markers.mjs';

const OURS = '<'.repeat(7);
const SPLIT = '='.repeat(7);
const THEIRS = '>'.repeat(7);

test('обычный конфликт: обе границы найдены', () => {
  const text = ['a', `${OURS} HEAD`, 'b', SPLIT, 'c', `${THEIRS} origin/main`, 'd'].join(
    '\n',
  );
  assert.deepEqual(findConflictMarkers(text), [2, 6]);
});

test('маркер после prettier: ячейка таблицы и вложенная цитата (инцидент 2026-09-27)', () => {
  const text = [
    `| ${OURS} HEAD                                                     |`,
    '| [0128](0128-x.md)              | Вопрос |',
    `| ${SPLIT}                                                          |`,
    '',
    '> > > > > > > origin/main',
  ].join('\n');
  assert.deepEqual(findConflictMarkers(text), [1, 5]);
});

test('маркер без метки ветки', () => {
  assert.deepEqual(findConflictMarkers(`x\n${OURS}\ny\n${THEIRS}`), [2, 4]);
});

test('подчёркивание заголовка, цитата, стрелки и сравнения — не маркер', () => {
  const text = [
    'Заголовок',
    SPLIT,
    '> цитата',
    '> > вложенная цитата',
    'a >> b << c',
    'if (x >>> 1) {}',
    '<< < <<<',
  ].join('\n');
  assert.deepEqual(findConflictMarkers(text), []);
});
