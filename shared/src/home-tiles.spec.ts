import { describe, expect, it } from 'vitest';
import {
  HOME_TILES,
  STAFF_HOME_TILES,
  STUDENT_HOME_TILES,
  buildHomeTilesInput,
  normalizeHomeHiddenTiles,
} from './home-tiles';

describe('списки плиток', () => {
  it('ключи ролей входят в общий список: иначе их не пропустит валидатор', () => {
    for (const key of [...STUDENT_HOME_TILES, ...STAFF_HOME_TILES]) {
      expect(HOME_TILES).toContain(key);
    }
  });

  it('входов в разделы у штата среди плиток нет (ADR-0179)', () => {
    expect(HOME_TILES).toEqual(
      expect.not.arrayContaining(['lessons', 'broadcasts', 'materials', 'school']),
    );
  });

  it('у ученика ближайшее занятие первым (ADR-0179)', () => {
    expect(STUDENT_HOME_TILES[0]).toBe('nextLesson');
  });
});

describe('normalizeHomeHiddenTiles', () => {
  it('схлопывает повторы и ставит ключи в канонический порядок', () => {
    expect(
      normalizeHomeHiddenTiles(['events', 'payment', 'events', 'nextLesson']),
    ).toEqual(['nextLesson', 'payment', 'events']);
  });

  it('выбрасывает неизвестные ключи: след прежней версии не роняет экран', () => {
    expect(normalizeHomeHiddenTiles(['payment', 'старая-плитка'])).toEqual(['payment']);
  });

  it('пусто и undefined — пусто', () => {
    expect(normalizeHomeHiddenTiles([])).toEqual([]);
    expect(normalizeHomeHiddenTiles(undefined)).toEqual([]);
  });
});

describe('buildHomeTilesInput', () => {
  it('внутри диалога берёт выбранное, чужие для роли ключи не трогает', () => {
    const body = buildHomeTilesInput(['exams', 'grading'], STAFF_HOME_TILES, ['events']);

    expect(body).toEqual({ hidden: ['exams', 'events'] });
  });

  it('снятие всех галочек очищает свои ключи и оставляет чужие', () => {
    expect(buildHomeTilesInput(['payment', 'grading'], STAFF_HOME_TILES, [])).toEqual({
      hidden: ['payment'],
    });
    expect(buildHomeTilesInput(['payment'], STUDENT_HOME_TILES, [])).toEqual({
      hidden: [],
    });
  });
});
