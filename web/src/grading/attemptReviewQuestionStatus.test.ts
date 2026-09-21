import { describe, expect, it } from 'vitest';
import { attemptReviewQuestionStatus } from './attemptReviewQuestionStatus';

describe('attemptReviewQuestionStatus — без вариантов', () => {
  it('текст, есть ответ — «Смотрите вы», тон neutral', () => {
    expect(
      attemptReviewQuestionStatus({ kind: 'text', options: [], answered: true }),
    ).toEqual({
      label: 'Смотрите вы',
      tone: 'neutral',
    });
  });

  it('текст без ответа — «Не отвечено», не «Смотрите вы» (отзыв владельца 2026-09-21)', () => {
    expect(
      attemptReviewQuestionStatus({ kind: 'text', options: [], answered: false }),
    ).toEqual({
      label: 'Не отвечено',
      tone: 'neutral',
    });
  });
});

describe('attemptReviewQuestionStatus — видео (ADR-0037, свой itemId)', () => {
  it('медиа этого вопроса нет — «Ответа нет»', () => {
    expect(
      attemptReviewQuestionStatus({ kind: 'video', options: [], answered: false }, false),
    ).toEqual({
      label: 'Ответа нет',
      tone: 'neutral',
    });
  });

  it('медиа этого вопроса пришло — «Есть ответ», даже при answered: false (ответ видео — media, не answers)', () => {
    expect(
      attemptReviewQuestionStatus({ kind: 'video', options: [], answered: false }, true),
    ).toEqual({
      label: 'Есть ответ',
      tone: 'neutral',
    });
  });
});

describe('attemptReviewQuestionStatus — вопрос без ответа (отзыв владельца 2026-09-21)', () => {
  it('вариант без ответа — «Не отвечено», не «0 из N»', () => {
    expect(
      attemptReviewQuestionStatus({
        kind: 'single',
        options: [{ id: 'o1', text: 'Три', correct: true, selected: false }],
        answered: false,
      }),
    ).toEqual({ label: 'Не отвечено', tone: 'neutral' });
  });
});

describe('attemptReviewQuestionStatus — с вариантами', () => {
  it('без optionsCheck в снимке — null, ничего не выдумываем', () => {
    expect(
      attemptReviewQuestionStatus({
        kind: 'single',
        options: [{ id: 'o1', text: 'Три', correct: true, selected: true }],
        answered: true,
      }),
    ).toBeNull();
  });

  it('выбраны все верные без лишних — «Верно», тон jade', () => {
    expect(
      attemptReviewQuestionStatus({
        kind: 'single',
        options: [{ id: 'o1', text: 'Три', correct: true, selected: true }],
        answered: true,
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
        answered: true,
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
        answered: true,
        optionsCheck: {
          correctSelectedCount: 1,
          correctTotalCount: 1,
          incorrectSelectedCount: 1,
        },
      }),
    ).toEqual({ label: '1 из 1', tone: 'neutral' });
  });
});
