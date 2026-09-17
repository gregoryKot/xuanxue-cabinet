import { describe, expect, it } from 'vitest';
import { attemptReviewQuestionStatus } from './attemptReviewQuestionStatus';

describe('attemptReviewQuestionStatus — без вариантов', () => {
  it('текст — «Смотрите вы», тон neutral', () => {
    expect(attemptReviewQuestionStatus({ kind: 'text', options: [] })).toEqual({
      label: 'Смотрите вы',
      tone: 'neutral',
    });
  });
});

describe('attemptReviewQuestionStatus — видео (ADR-0037, свой itemId)', () => {
  it('медиа этого вопроса нет — «Ответа нет»', () => {
    expect(attemptReviewQuestionStatus({ kind: 'video', options: [] }, false)).toEqual({
      label: 'Ответа нет',
      tone: 'neutral',
    });
  });

  it('медиа этого вопроса пришло — «Есть ответ», не «Верно» (видео не проверено)', () => {
    expect(attemptReviewQuestionStatus({ kind: 'video', options: [] }, true)).toEqual({
      label: 'Есть ответ',
      tone: 'neutral',
    });
  });
});

describe('attemptReviewQuestionStatus — с вариантами', () => {
  it('без optionsCheck в снимке — null, ничего не выдумываем', () => {
    expect(
      attemptReviewQuestionStatus({
        kind: 'single',
        options: [{ id: 'o1', text: 'Три', correct: true, selected: true }],
      }),
    ).toBeNull();
  });

  it('выбраны все верные без лишних — «Верно», тон jade', () => {
    expect(
      attemptReviewQuestionStatus({
        kind: 'single',
        options: [{ id: 'o1', text: 'Три', correct: true, selected: true }],
        optionsCheck: {
          correctSelectedCount: 1,
          correctTotalCount: 1,
          incorrectSelectedCount: 0,
        },
      }),
    ).toEqual({ label: 'Верно', tone: 'jade' });
  });

  it('пропущен верный вариант — счёт без цвета опасности', () => {
    expect(
      attemptReviewQuestionStatus({
        kind: 'single',
        options: [{ id: 'o1', text: 'Три', correct: true, selected: false }],
        optionsCheck: {
          correctSelectedCount: 2,
          correctTotalCount: 3,
          incorrectSelectedCount: 0,
        },
      }),
    ).toEqual({ label: '2 из 3', tone: 'neutral' });
  });

  it('выбран лишний неверный вариант — тоже счёт, не «Верно»', () => {
    expect(
      attemptReviewQuestionStatus({
        kind: 'single',
        options: [{ id: 'o1', text: 'Три', correct: true, selected: true }],
        optionsCheck: {
          correctSelectedCount: 1,
          correctTotalCount: 1,
          incorrectSelectedCount: 1,
        },
      }),
    ).toEqual({ label: '1 из 1', tone: 'neutral' });
  });
});
