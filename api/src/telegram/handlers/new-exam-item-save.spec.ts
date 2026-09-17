// Сборка входа ExamItemsService.create() и тексты сохранения (ТЗ 4б.3) —
// чистая логика, как attempt-submitted-message.spec.ts.
import type { NewExamItemDraft } from '../new-exam-item-draft-wait';
import {
  buildCreateExamItemInput,
  newExamItemAlreadySavedMessage,
  newExamItemSavedMessage,
} from './new-exam-item-save';

describe('buildCreateExamItemInput', () => {
  it('single — options попадают во вход, hint не заводим', () => {
    const draft: NewExamItemDraft = {
      step: 'confirm',
      kind: 'single',
      prompt: 'Вопрос?',
      criteria: 'Критерий',
      options: [
        { text: 'A', correct: true },
        { text: 'B', correct: false },
      ],
    };
    expect(buildCreateExamItemInput(draft)).toEqual({
      kind: 'single',
      prompt: 'Вопрос?',
      criteria: 'Критерий',
      options: [
        { text: 'A', correct: true },
        { text: 'B', correct: false },
      ],
    });
  });

  it('text/video — options не передаём вовсе (у вопроса их не бывает)', () => {
    const draft: NewExamItemDraft = {
      step: 'confirm',
      kind: 'text',
      prompt: 'Опишите форму',
      options: [],
    };
    expect(buildCreateExamItemInput(draft).options).toBeUndefined();
  });

  it('без формулировки (защита в глубину) — пустая строка, не undefined', () => {
    const draft: NewExamItemDraft = { step: 'confirm', kind: 'video', options: [] };
    expect(buildCreateExamItemInput(draft).prompt).toBe('');
  });
});

describe('newExamItemSavedMessage/newExamItemAlreadySavedMessage', () => {
  it('без PUBLIC_URL — без ссылки', () => {
    expect(newExamItemSavedMessage('507f1f77bcf86cd799439011', undefined)).toBe(
      'Вопрос сохранён, он уже в разделе «Вопросы» кабинета.',
    );
  });

  it('с PUBLIC_URL — ссылка на карточку вопроса', () => {
    expect(
      newExamItemSavedMessage('507f1f77bcf86cd799439011', 'https://xuanxue.su'),
    ).toBe(
      'Вопрос сохранён, он уже в разделе «Вопросы» кабинета.\n' +
        'https://xuanxue.su/exam-items/507f1f77bcf86cd799439011',
    );
  });

  it('повторное сохранение — другой текст, та же ссылка', () => {
    expect(
      newExamItemAlreadySavedMessage('507f1f77bcf86cd799439011', 'https://xuanxue.su'),
    ).toBe(
      'Этот вопрос уже сохранён, он в разделе «Вопросы» кабинета.\n' +
        'https://xuanxue.su/exam-items/507f1f77bcf86cd799439011',
    );
  });
});
