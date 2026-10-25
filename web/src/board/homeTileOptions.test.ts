import { describe, expect, it } from 'vitest';
import { HOME_TILES, STAFF_HOME_TILES, STUDENT_HOME_TILES } from '@xuanxue/shared';
import { makeMe } from '../test-support/meFixture';
import { hasHiddenOwnTile, hiddenTilesOf, homeTileOptions } from './homeTileOptions';

describe('homeTileOptions', () => {
  it('у ученика пять плиток, ближайшее занятие первым, у каждой подпись', () => {
    const options = homeTileOptions(false);

    expect(options.map((option) => option.key)).toEqual([...STUDENT_HOME_TILES]);
    expect(options[0]).toEqual({ key: 'nextLesson', label: 'Ближайшее занятие' });
    expect(options.every((option) => option.label.length > 0)).toBe(true);
  });

  it('у штата три плитки: объявление, проверка, события', () => {
    expect(homeTileOptions(true).map((option) => option.key)).toEqual([
      ...STAFF_HOME_TILES,
    ]);
  });

  it('входов в разделы среди плиток нет, каждый ключ есть в общем списке', () => {
    const keys = [...homeTileOptions(true), ...homeTileOptions(false)].map(
      (option) => option.key,
    );

    expect(keys.every((key) => HOME_TILES.includes(key))).toBe(true);
  });

  it('одно и то же событие подписано по-разному ролям только там, где нужно', () => {
    const notice = (staff: boolean) =>
      homeTileOptions(staff).find((option) => option.key === 'notice')?.label;

    expect(notice(false)).toBe('Объявление школы');
    expect(notice(true)).toBe('Объявление ученикам');
  });
});

describe('hasHiddenOwnTile', () => {
  it('ничего не скрыто — нет', () => {
    expect(hasHiddenOwnTile([], false)).toBe(false);
  });

  it('скрыта плитка этой роли — да', () => {
    expect(hasHiddenOwnTile(['payment'], false)).toBe(true);
    expect(hasHiddenOwnTile(['grading'], true)).toBe(true);
  });

  it('скрыта плитка только другой роли — нет', () => {
    expect(hasHiddenOwnTile(['grading'], false)).toBe(false);
    expect(hasHiddenOwnTile(['payment'], true)).toBe(false);
  });
});

describe('hiddenTilesOf', () => {
  it('сессии ещё нет — ничего не скрыто', () => {
    expect(hiddenTilesOf(null)).toEqual([]);
  });

  it('берёт скрытое из профиля', () => {
    expect(hiddenTilesOf(makeMe({ homeHiddenTiles: ['payment'] }))).toEqual(['payment']);
  });
});
