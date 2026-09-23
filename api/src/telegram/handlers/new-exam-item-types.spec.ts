// Чистая логика диалога «Новый вопрос» (ТЗ 4б.3) — без Mongo и без Telegram.
import { Types } from 'mongoose';
import type { BotSessionLean } from '../bot-session.lean';
import {
  correctCount,
  hasOptionsStep,
  isActiveExamItemDraft,
  isExamItemKind,
  markOnlyOptionCorrect,
  newExamItemCancelButton,
  sessionToNewExamItemDraft,
  toggleOptionCorrect,
} from './new-exam-item-types';

describe('hasOptionsStep', () => {
  it('single/multiple — да, text/video — нет', () => {
    expect(hasOptionsStep('single')).toBe(true);
    expect(hasOptionsStep('multiple')).toBe(true);
    expect(hasOptionsStep('text')).toBe(false);
    expect(hasOptionsStep('video')).toBe(false);
  });
});

describe('isExamItemKind', () => {
  it('только известные виды', () => {
    expect(isExamItemKind('single')).toBe(true);
    expect(isExamItemKind('нет-такого')).toBe(false);
  });
});

describe('isActiveExamItemDraft', () => {
  it('null — не черновик', () => {
    expect(isActiveExamItemDraft(null)).toBe(false);
  });

  it('другой вид сессии — не черновик', () => {
    expect(isActiveExamItemDraft({ kind: 'topic' })).toBe(false);
  });

  it('examItemDraft без draftKind (шаг ещё не выбран) — не черновик', () => {
    expect(isActiveExamItemDraft({ kind: 'examItemDraft' })).toBe(false);
  });

  it('examItemDraft с draftKind — черновик', () => {
    expect(isActiveExamItemDraft({ kind: 'examItemDraft', draftKind: 'text' })).toBe(
      true,
    );
  });
});

describe('sessionToNewExamItemDraft', () => {
  it('draft*-поля сессии превращаются в NewExamItemDraft', () => {
    const itemId = new Types.ObjectId();
    const session = {
      kind: 'examItemDraft',
      draftStep: 'confirm',
      draftKind: 'single',
      draftPrompt: 'Вопрос?',
      draftOptions: [{ text: 'A', correct: true }],
      draftSavedItemId: itemId,
    } as unknown as BotSessionLean & { draftKind: 'single' };

    expect(sessionToNewExamItemDraft(session)).toEqual({
      step: 'confirm',
      kind: 'single',
      prompt: 'Вопрос?',
      options: [{ text: 'A', correct: true }],
      savedItemId: itemId.toString(),
    });
  });

  it('без draftStep — по умолчанию prompt; без draftOptions — пустой список', () => {
    const session = {
      kind: 'examItemDraft',
      draftKind: 'text',
    } as unknown as BotSessionLean & { draftKind: 'text' };

    expect(sessionToNewExamItemDraft(session)).toEqual({
      step: 'prompt',
      kind: 'text',
      prompt: undefined,
      options: [],
      savedItemId: undefined,
    });
  });
});

describe('correctCount', () => {
  it('считает только отмеченные верными', () => {
    expect(
      correctCount([
        { text: 'A', correct: true },
        { text: 'B', correct: false },
        { text: 'C', correct: true },
      ]),
    ).toBe(2);
    expect(correctCount([])).toBe(0);
  });
});

describe('toggleOptionCorrect', () => {
  it('переключает только указанный индекс, остальные не трогает', () => {
    const options = [
      { text: 'A', correct: false },
      { text: 'B', correct: true },
    ];
    expect(toggleOptionCorrect(options, 0)).toEqual([
      { text: 'A', correct: true },
      { text: 'B', correct: true },
    ]);
    expect(toggleOptionCorrect(options, 1)).toEqual([
      { text: 'A', correct: false },
      { text: 'B', correct: false },
    ]);
  });
});

describe('markOnlyOptionCorrect', () => {
  it('отмечает ровно один вариант, снимая отметку с остальных', () => {
    const options = [
      { text: 'A', correct: true },
      { text: 'B', correct: false },
      { text: 'C', correct: false },
    ];
    expect(markOnlyOptionCorrect(options, 2)).toEqual([
      { text: 'A', correct: false },
      { text: 'B', correct: false },
      { text: 'C', correct: true },
    ]);
  });
});

describe('newExamItemCancelButton', () => {
  it('одна кнопка «Отмена» с callback nqf:cancel', () => {
    expect(newExamItemCancelButton()).toEqual([
      { text: 'Отмена', callback_data: 'nqf:cancel' },
    ]);
  });
});
