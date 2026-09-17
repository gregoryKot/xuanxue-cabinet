import { describe, expect, it } from 'vitest';
import type { AttemptReviewQuestionDto, ExamMediaDto } from '@xuanxue/shared';
import { attemptReviewMediaByQuestion } from './attemptReviewMediaByQuestion';

function makeMedia(overrides: Partial<ExamMediaDto> = {}): ExamMediaDto {
  return {
    id: 'm1',
    attemptId: 'a1',
    kind: 'telegram',
    receivedAt: '2026-09-12T00:00:00Z',
    ...overrides,
  };
}

function makeQuestion(
  overrides: Partial<Pick<AttemptReviewQuestionDto, 'itemId' | 'kind'>> = {},
): Pick<AttemptReviewQuestionDto, 'itemId' | 'kind'> {
  return { itemId: 'q1', kind: 'video', ...overrides };
}

describe('attemptReviewMediaByQuestion — нет записей', () => {
  it('пустой список записей — пустая карта и пустой список ничьих', () => {
    const result = attemptReviewMediaByQuestion([], [makeQuestion()]);

    expect(result.byItemId.size).toBe(0);
    expect(result.unassigned).toEqual([]);
  });
});

describe('attemptReviewMediaByQuestion — по вопросам', () => {
  it('две записи к разным видео-вопросам — каждая в своей группе', () => {
    const m1 = makeMedia({ id: 'm1', itemId: 'q1' });
    const m2 = makeMedia({ id: 'm2', itemId: 'q2' });

    const result = attemptReviewMediaByQuestion(
      [m1, m2],
      [makeQuestion({ itemId: 'q1' }), makeQuestion({ itemId: 'q2' })],
    );

    expect(result.byItemId.get('q1')).toEqual([m1]);
    expect(result.byItemId.get('q2')).toEqual([m2]);
    expect(result.unassigned).toEqual([]);
  });

  it('две записи на один вопрос — обе в его группе, по порядку прихода', () => {
    const m1 = makeMedia({ id: 'm1', itemId: 'q1' });
    const m2 = makeMedia({ id: 'm2', itemId: 'q1' });

    const result = attemptReviewMediaByQuestion(
      [m1, m2],
      [makeQuestion({ itemId: 'q1' })],
    );

    expect(result.byItemId.get('q1')).toEqual([m1, m2]);
  });
});

describe('attemptReviewMediaByQuestion — без вопроса', () => {
  it('все записи без itemId — все в unassigned, карта пустая', () => {
    const m1 = makeMedia({ id: 'm1' });
    const m2 = makeMedia({ id: 'm2' });

    const result = attemptReviewMediaByQuestion(
      [m1, m2],
      [makeQuestion({ itemId: 'q1' })],
    );

    expect(result.byItemId.size).toBe(0);
    expect(result.unassigned).toEqual([m1, m2]);
  });

  it('itemId не встречается среди вопросов снимка — тоже unassigned, не пропадает', () => {
    const stray = makeMedia({ id: 'm1', itemId: 'ghost' });

    const result = attemptReviewMediaByQuestion(
      [stray],
      [makeQuestion({ itemId: 'q1' })],
    );

    expect(result.byItemId.size).toBe(0);
    expect(result.unassigned).toEqual([stray]);
  });

  it('itemId указывает на вопрос не типа video (ADR-0037) — unassigned, не чужая карточка', () => {
    const item = makeMedia({ id: 'm1', itemId: 'q1' });

    const result = attemptReviewMediaByQuestion(
      [item],
      [makeQuestion({ itemId: 'q1', kind: 'text' })],
    );

    expect(result.byItemId.size).toBe(0);
    expect(result.unassigned).toEqual([item]);
  });

  it('смешанный случай — с itemId в карте, без него и с чужим itemId в unassigned', () => {
    const withItem = makeMedia({ id: 'm1', itemId: 'q1' });
    const withoutItem = makeMedia({ id: 'm2' });
    const strayItem = makeMedia({ id: 'm3', itemId: 'ghost' });

    const result = attemptReviewMediaByQuestion(
      [withItem, withoutItem, strayItem],
      [makeQuestion({ itemId: 'q1' })],
    );

    expect(result.byItemId.get('q1')).toEqual([withItem]);
    expect(result.unassigned).toEqual([withoutItem, strayItem]);
  });
});
