// Чистая логика сборки входа и текстов после публикации — без Mongo и без
// Telegram (CLAUDE.md «Тесты»).
import {
  buildCreateExamInput,
  newExamAlreadyPublishedMessage,
  newExamPublishedMessage,
} from './new-exam-save';

describe('buildCreateExamInput', () => {
  it('один блок без заголовка (ADR-0033) — итог только itemIds', () => {
    const input = buildCreateExamInput({
      step: 'confirm',
      page: 0,
      itemIds: ['a', 'b'],
      title: 'Экзамен по форме',
      timeLimitMin: 30,
      attemptsAllowed: 2,
    });

    expect(input).toEqual({
      title: 'Экзамен по форме',
      blocks: [{ itemIds: ['a', 'b'] }],
      timeLimitMin: 30,
      attemptsAllowed: 2,
    });
  });

  it('без лимита времени — поле не появляется вовсе, не 0', () => {
    const input = buildCreateExamInput({
      step: 'confirm',
      page: 0,
      itemIds: ['a'],
      title: 'Экзамен',
      attemptsAllowed: 1,
    });
    expect(input.timeLimitMin).toBeUndefined();
  });

  // Защита в глубину — в обычном диалоге title к шагу 'confirm' уже задан
  // (title-wait screen текстом), но черновик, поправленный мимо кнопок, не
  // должен уйти в сервис с title: undefined.
  it('title не задан (защита в глубину) — пустая строка, не undefined', () => {
    const input = buildCreateExamInput({ step: 'confirm', page: 0, itemIds: ['a'] });
    expect(input.title).toBe('');
  });
});

describe('newExamPublishedMessage/newExamAlreadyPublishedMessage', () => {
  it('без PUBLIC_URL — текст без ссылки', () => {
    expect(newExamPublishedMessage('exam1', undefined)).toBe(
      'Экзамен опубликован, ученики видят его в /экзамены.',
    );
  });

  it('с PUBLIC_URL — ссылка на /exams/:id', () => {
    expect(newExamPublishedMessage('exam1', 'https://xuanxue.su')).toBe(
      'Экзамен опубликован, ученики видят его в /экзамены.\nhttps://xuanxue.su/exams/exam1',
    );
  });

  it('повторный клик — «уже опубликован», та же ссылка', () => {
    expect(newExamAlreadyPublishedMessage('exam1', 'https://xuanxue.su')).toBe(
      'Этот экзамен уже опубликован, он в /экзамены.\nhttps://xuanxue.su/exams/exam1',
    );
  });
});
