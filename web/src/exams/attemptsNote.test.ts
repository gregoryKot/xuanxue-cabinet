import { describe, expect, it } from 'vitest';
import { attemptsNote } from './attemptsNote';

describe('attemptsNote', () => {
  it('0 попыток — молчим: на чистой базе предупреждать не о чем', () => {
    expect(attemptsNote(0)).toBeNull();
  });

  it.each([
    [1, 'работа'],
    [2, 'работы'],
    [5, 'работ'],
    [11, 'работ'],
    [21, 'работа'],
  ])('%i попытка(и) — склонение «%s»', (total, word) => {
    expect(attemptsNote(total)).toBe(
      `Экзамен уже проходили — ${total} ${word}. Новые вопросы увидят только те, ` +
        'кто начнёт заново.',
    );
  });
});
