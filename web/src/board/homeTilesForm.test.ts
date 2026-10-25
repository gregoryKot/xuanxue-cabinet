import { describe, expect, it } from 'vitest';
import {
  hasHomeTilesChanges,
  homeTilesBody,
  initialHidden,
  setTileShown,
} from './homeTilesForm';

describe('initialHidden', () => {
  it('берёт из сохранённого только ключи этой главной', () => {
    expect(initialHidden(['payment', 'grading'], false)).toEqual(['payment']);
    expect(initialHidden(['payment', 'grading'], true)).toEqual(['grading']);
  });

  it('ничего не сохранено — ничего не скрыто', () => {
    expect(initialHidden([], false)).toEqual([]);
  });
});

describe('setTileShown', () => {
  it('снятая галочка скрывает плитку, поставленная — возвращает', () => {
    const hidden = setTileShown([], 'payment', false);
    expect(hidden).toEqual(['payment']);

    expect(setTileShown(hidden, 'payment', true)).toEqual([]);
  });

  it('повторное скрытие не плодит дубли, порядок канонический', () => {
    const hidden = setTileShown(setTileShown([], 'events', false), 'nextLesson', false);

    expect(hidden).toEqual(['nextLesson', 'events']);
    expect(setTileShown(hidden, 'events', false)).toEqual(['nextLesson', 'events']);
  });
});

describe('hasHomeTilesChanges', () => {
  it('без правок — нет, после правки — да, вернули как было — снова нет', () => {
    expect(hasHomeTilesChanges([], [], false)).toBe(false);
    expect(hasHomeTilesChanges([], ['payment'], false)).toBe(true);
    expect(hasHomeTilesChanges(['payment'], ['payment'], false)).toBe(false);
    expect(hasHomeTilesChanges(['payment'], [], false)).toBe(true);
  });

  it('скрытое в другой роли правкой не считается', () => {
    expect(hasHomeTilesChanges(['grading'], [], false)).toBe(false);
  });
});

describe('homeTilesBody', () => {
  it('отправляет выбор диалога', () => {
    expect(homeTilesBody([], ['payment', 'events'], false)).toEqual({
      hidden: ['payment', 'events'],
    });
  });

  it('скрытое в другой роли уходит как было: правка не стирает чужой выбор', () => {
    expect(homeTilesBody(['payment', 'grading'], [], false)).toEqual({
      hidden: ['grading'],
    });
    expect(homeTilesBody(['payment', 'grading'], ['events'], true)).toEqual({
      hidden: ['payment', 'events'],
    });
  });

  it('снять всё — пустой список', () => {
    expect(homeTilesBody(['payment'], [], false)).toEqual({ hidden: [] });
  });
});
