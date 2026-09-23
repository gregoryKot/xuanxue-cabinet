// Диспетчер кнопок «Новый вопрос» (ТЗ 4б.3) — фейковые BotSessionService/
// ExamBotPort/UsersService, без Mongo и без сети (тем же приёмом, что
// exam-callback-router.spec.ts): проверяем маршрутизацию, не саму механику
// шагов (она — new-exam-item-callback.spec-логика внутри new-exam-item-flow.spec.ts).
import { DateTime } from 'luxon';
import { fakeBotSessionService } from '../bot-session.service.test-support';
import { fakeExamBotPort } from '../exam-bot.port.test-support';
import { fakeFlowCtx as fakeCtxWithEdits } from './exam-attempt-flow.test-support';
import {
  isNewExamItemCallbackAction,
  routeNewExamItemCallback,
} from './new-exam-item-router';

const NOW = DateTime.utc(2026, 9, 17, 10, 0, 0);
const CHAT_ID = 111;

function fakeCtx() {
  return fakeCtxWithEdits().ctx;
}

describe('isNewExamItemCallbackAction', () => {
  it('nqk/nqo/nqd/nqf — да, остальные действия — нет', () => {
    expect(isNewExamItemCallbackAction('nqk')).toBe(true);
    expect(isNewExamItemCallbackAction('nqo')).toBe(true);
    expect(isNewExamItemCallbackAction('nqd')).toBe(true);
    expect(isNewExamItemCallbackAction('nqf')).toBe(true);
    expect(isNewExamItemCallbackAction('topic')).toBe(false);
    expect(isNewExamItemCallbackAction('exam')).toBe(false);
  });
});

describe('routeNewExamItemCallback', () => {
  it('nqk с известным типом — startNewExamItemDraft', async () => {
    const botSessions = fakeBotSessionService();
    await routeNewExamItemCallback(
      fakeCtx(),
      'nqk',
      'single',
      CHAT_ID,
      botSessions,
      fakeExamBotPort(),
      { findByTelegramId: jest.fn() } as never,
      undefined,
      NOW,
    );
    expect(botSessions.startNewExamItemDraft).toHaveBeenCalledWith(
      CHAT_ID,
      'single',
      NOW,
    );
  });

  it('nqk с неизвестным типом (чужой параметр) — тихо игнорируется', async () => {
    const botSessions = fakeBotSessionService();
    await routeNewExamItemCallback(
      fakeCtx(),
      'nqk',
      'нет-такого-типа',
      CHAT_ID,
      botSessions,
      fakeExamBotPort(),
      { findByTelegramId: jest.fn() } as never,
      undefined,
      NOW,
    );
    expect(botSessions.startNewExamItemDraft).not.toHaveBeenCalled();
  });

  it('nqo — переключает вариант по номеру (защита в глубину — сессии нет, тихо игнорируется)', async () => {
    const botSessions = fakeBotSessionService();
    await routeNewExamItemCallback(
      fakeCtx(),
      'nqo',
      '0',
      CHAT_ID,
      botSessions,
      fakeExamBotPort(),
      { findByTelegramId: jest.fn() } as never,
      undefined,
      NOW,
    );
    expect(botSessions.get).toHaveBeenCalledWith(CHAT_ID, NOW);
  });

  it.each(['options', 'correct'] as const)(
    'nqd:%s — зовёт handleNewExamItemDone с тем же target',
    async (target) => {
      const botSessions = fakeBotSessionService();
      await routeNewExamItemCallback(
        fakeCtx(),
        'nqd',
        target,
        CHAT_ID,
        botSessions,
        fakeExamBotPort(),
        { findByTelegramId: jest.fn() } as never,
        undefined,
        NOW,
      );
      expect(botSessions.get).toHaveBeenCalledWith(CHAT_ID, NOW);
    },
  );

  it('nqd с чужим параметром — тихо игнорируется (get не вызван)', async () => {
    const botSessions = fakeBotSessionService();
    await routeNewExamItemCallback(
      fakeCtx(),
      'nqd',
      'нет-такого-шага',
      CHAT_ID,
      botSessions,
      fakeExamBotPort(),
      { findByTelegramId: jest.fn() } as never,
      undefined,
      NOW,
    );
    expect(botSessions.get).not.toHaveBeenCalled();
  });

  it('nqf:cancel — clear и понятное сообщение', async () => {
    const botSessions = fakeBotSessionService();
    const { ctx, edits } = fakeCtxWithEdits();
    await routeNewExamItemCallback(
      ctx,
      'nqf',
      'cancel',
      CHAT_ID,
      botSessions,
      fakeExamBotPort(),
      { findByTelegramId: jest.fn() } as never,
      undefined,
      NOW,
    );
    expect(botSessions.clear).toHaveBeenCalledWith(CHAT_ID);
    expect(edits).toEqual(['Вопрос не заведён. Черновик отменён.']);
  });

  it('nqf:save — доходит до handleNewExamItemSave (get вызван для черновика)', async () => {
    const botSessions = fakeBotSessionService();
    const users = { findByTelegramId: jest.fn().mockResolvedValue(null) };
    await routeNewExamItemCallback(
      fakeCtx(),
      'nqf',
      'save',
      CHAT_ID,
      botSessions,
      fakeExamBotPort(),
      users as never,
      undefined,
      NOW,
    );
    expect(botSessions.get).toHaveBeenCalledWith(CHAT_ID, NOW);
  });

  it('nqf с чужим параметром (мимо callback-params.ts) — тихо игнорируется', async () => {
    const botSessions = fakeBotSessionService();
    await routeNewExamItemCallback(
      fakeCtx(),
      'nqf',
      'нет-такого-действия',
      CHAT_ID,
      botSessions,
      fakeExamBotPort(),
      { findByTelegramId: jest.fn() } as never,
      undefined,
      NOW,
    );
    expect(botSessions.get).not.toHaveBeenCalled();
    expect(botSessions.clear).not.toHaveBeenCalled();
  });
});
