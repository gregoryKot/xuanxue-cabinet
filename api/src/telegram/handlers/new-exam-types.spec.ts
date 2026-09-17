// Чистая логика диалога «Собрать экзамен» — без Mongo и без Telegram
// (CLAUDE.md «Тесты»).
import { Types } from 'mongoose';
import {
  isActiveNewExamDraft,
  newExamCancelButton,
  sessionToNewExamDraft,
  truncatePromptForButton,
} from './new-exam-types';

describe('newExamCancelButton', () => {
  it('кнопка «Отмена» шлёт nef:cancel', () => {
    expect(newExamCancelButton()).toEqual([
      { text: 'Отмена', callback_data: 'nef:cancel' },
    ]);
  });
});

describe('isActiveNewExamDraft', () => {
  it('null — нет активной сборки', () => {
    expect(isActiveNewExamDraft(null)).toBe(false);
  });

  it('другой вид ожидания (examItemDraft) — не активная сборка', () => {
    expect(isActiveNewExamDraft({ kind: 'examItemDraft', draftStep: 'prompt' })).toBe(
      false,
    );
  });

  it('examBuildDraft с известным шагом — активная сборка', () => {
    expect(isActiveNewExamDraft({ kind: 'examBuildDraft', buildStep: 'pick' })).toBe(
      true,
    );
  });
});

describe('sessionToNewExamDraft', () => {
  it('собирает NewExamDraft из build*-полей сессии, itemIds — строки', () => {
    const itemId = new Types.ObjectId();
    const draft = sessionToNewExamDraft({
      kind: 'examBuildDraft',
      buildStep: 'confirm',
      buildItemIds: [itemId],
      buildPage: 1,
      buildTitle: 'Экзамен по форме',
      buildTimeLimitMin: 30,
      buildAttemptsAllowed: 2,
    });

    expect(draft).toEqual({
      step: 'confirm',
      page: 1,
      itemIds: [itemId.toString()],
      title: 'Экзамен по форме',
      timeLimitMin: 30,
      attemptsAllowed: 2,
      savedExamId: undefined,
    });
  });

  it('page/itemIds не заданы — 0 и пустой список, не undefined', () => {
    const draft = sessionToNewExamDraft({ kind: 'examBuildDraft', buildStep: 'pick' });
    expect(draft.page).toBe(0);
    expect(draft.itemIds).toEqual([]);
  });
});

describe('truncatePromptForButton', () => {
  it('короткая формулировка — без изменений', () => {
    expect(truncatePromptForButton('Сколько форм?')).toBe('Сколько форм?');
  });

  it('длинная формулировка — обрезана с многоточием', () => {
    const long = 'а'.repeat(60);
    const truncated = truncatePromptForButton(long);
    expect(truncated.length).toBe(46);
    expect(truncated.endsWith('…')).toBe(true);
  });
});
