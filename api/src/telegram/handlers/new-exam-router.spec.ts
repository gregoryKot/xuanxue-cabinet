// Диспетчер кнопок «Собрать экзамен» (ТЗ 4б.4) — фейковые
// BotSessionService/ExamBotPort/UsersService, без Mongo и без сети (тем же
// приёмом, что new-exam-item-router.spec.ts): проверяем маршрутизацию, не
// саму механику шагов (она — интеграционный new-exam-flow.spec.ts).
import { DateTime } from 'luxon';
import { fakeBotSessionService } from '../bot-session.service.test-support';
import { fakeExamBotPort } from '../exam-bot.port.test-support';
import { fakeFlowCtx as fakeCtxWithEdits } from './exam-attempt-flow.test-support';
import { isNewExamCallbackAction, routeNewExamCallback } from './new-exam-router';

const NOW = DateTime.utc(2026, 9, 17, 10, 0, 0);
const CHAT_ID = 111;

function fakeCtx() {
  return fakeCtxWithEdits().ctx;
}

describe('isNewExamCallbackAction', () => {
  it('net/nep/nea/nel/nen/ned/nef — да, остальные действия — нет', () => {
    expect(isNewExamCallbackAction('net')).toBe(true);
    expect(isNewExamCallbackAction('nep')).toBe(true);
    expect(isNewExamCallbackAction('nea')).toBe(true);
    expect(isNewExamCallbackAction('nel')).toBe(true);
    expect(isNewExamCallbackAction('nen')).toBe(true);
    expect(isNewExamCallbackAction('ned')).toBe(true);
    expect(isNewExamCallbackAction('nef')).toBe(true);
    expect(isNewExamCallbackAction('nqf')).toBe(false);
    expect(isNewExamCallbackAction('exam')).toBe(false);
  });
});

describe('routeNewExamCallback', () => {
  it('net — доходит до handleNewExamToggleItem (get вызван)', async () => {
    const botSessions = fakeBotSessionService();
    await routeNewExamCallback(
      fakeCtx(),
      'net',
      '507f1f77bcf86cd799439011',
      CHAT_ID,
      botSessions,
      fakeExamBotPort(),
      { findByTelegramId: jest.fn() } as never,
      undefined,
      NOW,
    );
    expect(botSessions.get).toHaveBeenCalledWith(CHAT_ID, NOW);
  });

  it.each(['prev', 'next'] as const)(
    'nep:%s — зовёт handleNewExamPage с тем же направлением',
    async (direction) => {
      const botSessions = fakeBotSessionService();
      await routeNewExamCallback(
        fakeCtx(),
        'nep',
        direction,
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

  it('nep с чужим параметром — тихо игнорируется (get не вызван)', async () => {
    const botSessions = fakeBotSessionService();
    await routeNewExamCallback(
      fakeCtx(),
      'nep',
      'нет-такой-страницы',
      CHAT_ID,
      botSessions,
      fakeExamBotPort(),
      { findByTelegramId: jest.fn() } as never,
      undefined,
      NOW,
    );
    expect(botSessions.get).not.toHaveBeenCalled();
  });

  it('nea — доходит до handleNewExamAssemble (get вызван)', async () => {
    const botSessions = fakeBotSessionService();
    await routeNewExamCallback(
      fakeCtx(),
      'nea',
      'go',
      CHAT_ID,
      botSessions,
      fakeExamBotPort(),
      { findByTelegramId: jest.fn() } as never,
      undefined,
      NOW,
    );
    expect(botSessions.get).toHaveBeenCalledWith(CHAT_ID, NOW);
  });

  it('nel — доходит до handleNewExamTimeLimit (get вызван)', async () => {
    const botSessions = fakeBotSessionService();
    await routeNewExamCallback(
      fakeCtx(),
      'nel',
      'none',
      CHAT_ID,
      botSessions,
      fakeExamBotPort(),
      { findByTelegramId: jest.fn() } as never,
      undefined,
      NOW,
    );
    expect(botSessions.get).toHaveBeenCalledWith(CHAT_ID, NOW);
  });

  it('nen с известным числом — доходит до handleNewExamAttempts (get вызван)', async () => {
    const botSessions = fakeBotSessionService();
    await routeNewExamCallback(
      fakeCtx(),
      'nen',
      '2',
      CHAT_ID,
      botSessions,
      fakeExamBotPort(),
      { findByTelegramId: jest.fn() } as never,
      undefined,
      NOW,
    );
    expect(botSessions.get).toHaveBeenCalledWith(CHAT_ID, NOW);
  });

  it('nen с чужим параметром (мимо callback-params.ts) — тихо игнорируется', async () => {
    const botSessions = fakeBotSessionService();
    await routeNewExamCallback(
      fakeCtx(),
      'nen',
      '9',
      CHAT_ID,
      botSessions,
      fakeExamBotPort(),
      { findByTelegramId: jest.fn() } as never,
      undefined,
      NOW,
    );
    expect(botSessions.get).not.toHaveBeenCalled();
  });

  it('ned — доходит до handleNewExamDueAt (get вызван)', async () => {
    const botSessions = fakeBotSessionService();
    await routeNewExamCallback(
      fakeCtx(),
      'ned',
      '1w',
      CHAT_ID,
      botSessions,
      fakeExamBotPort(),
      { findByTelegramId: jest.fn() } as never,
      undefined,
      NOW,
    );
    expect(botSessions.get).toHaveBeenCalledWith(CHAT_ID, NOW);
  });

  it('nef:cancel — clear и понятное сообщение', async () => {
    const botSessions = fakeBotSessionService();
    const { ctx, edits } = fakeCtxWithEdits();
    await routeNewExamCallback(
      ctx,
      'nef',
      'cancel',
      CHAT_ID,
      botSessions,
      fakeExamBotPort(),
      { findByTelegramId: jest.fn() } as never,
      undefined,
      NOW,
    );
    expect(botSessions.clear).toHaveBeenCalledWith(CHAT_ID);
    expect(edits).toEqual(['Экзамен не собран. Черновик отменён.']);
  });

  it('nef:publish — доходит до handleNewExamPublish (get вызван для черновика)', async () => {
    const botSessions = fakeBotSessionService();
    const users = { findByTelegramId: jest.fn().mockResolvedValue(null) };
    await routeNewExamCallback(
      fakeCtx(),
      'nef',
      'publish',
      CHAT_ID,
      botSessions,
      fakeExamBotPort(),
      users as never,
      undefined,
      NOW,
    );
    expect(botSessions.get).toHaveBeenCalledWith(CHAT_ID, NOW);
  });

  it('nef с чужим параметром (мимо callback-params.ts) — тихо игнорируется', async () => {
    const botSessions = fakeBotSessionService();
    await routeNewExamCallback(
      fakeCtx(),
      'nef',
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
