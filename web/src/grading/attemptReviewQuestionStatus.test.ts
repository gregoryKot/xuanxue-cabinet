import { describe, expect, it } from 'vitest';
import { attemptReviewQuestionStatus } from './attemptReviewQuestionStatus';

describe('attemptReviewQuestionStatus — без вариантов', () => {
  it('текст/видео — «Смотрите вы», тон neutral', () => {
    expect(attemptReviewQuestionStatus({ options: [] })).toEqual({
      label: 'Смотрите вы',
      tone: 'neutral',
    });
  });
});

describe('attemptReviewQuestionStatus — с вариантами', () => {
  it('без optionsCheck в снимке — null, ничего не выдумываем', () => {
    expect(
      attemptReviewQuestionStatus({
        options: [{ id: 'o1', text: 'Три', correct: true, selected: true }],
      }),
    ).toBeNull();
  });

  it('выбраны все верные без лишних — «Верно», тон jade', () => {
    expect(
      attemptReviewQuestionStatus({
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
