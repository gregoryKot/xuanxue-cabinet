// Кнопки диалога «Новый вопрос» (ТЗ 4б.3) — фейковый BotSessionService, без
// Mongo (полный диалог — интеграционный new-exam-item-flow.spec.ts): здесь
// защитные ветки — устаревшая кнопка/чужой шаг молча игнорируется.
import { DateTime } from 'luxon';
import type { BotSessionLean } from '../bot-session.service';
import { fakeBotSessionService } from '../bot-session.service.test-support';
import { fakeFlowCtx } from './exam-attempt-flow.test-support';
import {
  handleNewExamItemDone,
  handleNewExamItemOptionToggle,
  handleNewExamItemSkipCriteria,
} from './new-exam-item-callback';

const NOW = DateTime.utc(2026, 9, 17, 10, 0, 0);
const CHAT_ID = 111;

describe('handleNewExamItemDone — защита от устаревшей кнопки', () => {
  it('черновика нет — тихо игнорируется', async () => {
    const botSessions = fakeBotSessionService({ get: jest.fn().mockResolvedValue(null) });
    const { ctx, edits } = fakeFlowCtx();

    await handleNewExamItemDone(ctx, botSessions, CHAT_ID, 'options', NOW);

    expect(edits).toEqual([]);
  });

  it('кнопка «Готово» с прошлого экрана — текущий шаг другой, игнорируется', async () => {
    const session: BotSessionLean = {
      kind: 'examItemDraft',
      draftKind: 'single',
      draftStep: 'criteria',
      draftOptions: [],
    };
    const botSessions = fakeBotSessionService({
      get: jest.fn().mockResolvedValue(session),
    });
    const { ctx, edits } = fakeFlowCtx();

    await handleNewExamItemDone(ctx, botSessions, CHAT_ID, 'options', NOW);

    expect(edits).toEqual([]);
    expect(botSessions.setNewExamItemDraft).not.toHaveBeenCalled();
  });
});

describe('handleNewExamItemOptionToggle — защита от устаревшей кнопки', () => {
  it('номер варианта за пределами текущего списка — игнорируется', async () => {
    const session: BotSessionLean = {
      kind: 'examItemDraft',
      draftKind: 'multiple',
      draftStep: 'correct',
      draftOptions: [{ text: 'A', correct: false }],
    };
    const botSessions = fakeBotSessionService({
      get: jest.fn().mockResolvedValue(session),
    });
    const { ctx, edits } = fakeFlowCtx();

    await handleNewExamItemOptionToggle(ctx, botSessions, CHAT_ID, 5, NOW);

    expect(edits).toEqual([]);
    expect(botSessions.setNewExamItemDraft).not.toHaveBeenCalled();
  });

  it('не на шаге отметки верного — игнорируется', async () => {
    const session: BotSessionLean = {
      kind: 'examItemDraft',
      draftKind: 'multiple',
      draftStep: 'options',
      draftOptions: [{ text: 'A', correct: false }],
    };
    const botSessions = fakeBotSessionService({
      get: jest.fn().mockResolvedValue(session),
    });
    const { ctx, edits } = fakeFlowCtx();

    await handleNewExamItemOptionToggle(ctx, botSessions, CHAT_ID, 0, NOW);

    expect(edits).toEqual([]);
  });
});

describe('handleNewExamItemSkipCriteria — защита от устаревшей кнопки', () => {
  it('не на шаге критериев — игнорируется', async () => {
    const session: BotSessionLean = {
      kind: 'examItemDraft',
      draftKind: 'text',
      draftStep: 'prompt',
      draftOptions: [],
    };
    const botSessions = fakeBotSessionService({
      get: jest.fn().mockResolvedValue(session),
    });
    const { ctx, edits } = fakeFlowCtx();

    await handleNewExamItemSkipCriteria(ctx, botSessions, CHAT_ID, NOW);

    expect(edits).toEqual([]);
    expect(botSessions.setNewExamItemDraft).not.toHaveBeenCalled();
  });
});
