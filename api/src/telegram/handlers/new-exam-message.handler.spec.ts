// Свободный текст диалога «Собрать экзамен» (ТЗ 4б.4) — фейковые
// BotSessionService/ExamBotPort, без Mongo (полный диалог — интеграционный
// new-exam-flow.spec.ts): здесь — отдельные ветки (не текст, число вне
// формата, ошибка DTO на каждом шаге, чужой шаг).
import { DateTime } from 'luxon';
import type { BotSessionLean } from '../bot-session.lean';
import { fakeBotSessionService } from '../bot-session.service.test-support';
import { ExamBotPortRegistry } from '../exam-bot-port.registry';
import { fakeExamBotPort } from '../exam-bot.port.test-support';
import { fakeFlowCtx } from './exam-attempt-flow.test-support';
import { NewExamMessageHandler } from './new-exam-message.handler';

const NOW = DateTime.utc(2026, 9, 17, 10, 0, 0);
const CHAT_ID = 111;

function draftSession(overrides: Partial<BotSessionLean> = {}): BotSessionLean {
  return { kind: 'examBuildDraft', buildItemIds: [], ...overrides };
}

function buildHandler(port = fakeExamBotPort()) {
  const botSessions = fakeBotSessionService();
  const registry = new ExamBotPortRegistry();
  registry.set(port);
  return {
    handler: new NewExamMessageHandler(botSessions, registry),
    botSessions,
    port,
  };
}

describe('NewExamMessageHandler', () => {
  it('не текстовое сообщение — просит текст, шаг не меняется', async () => {
    const { handler, botSessions } = buildHandler();
    const { ctx, replies } = fakeFlowCtx({ video: true });

    await handler.handle(ctx, CHAT_ID, draftSession({ buildStep: 'title' }), NOW);

    expect(replies).toEqual([
      'Нажмите одну из кнопок или пришлите текст, где это нужно.',
    ]);
    expect(botSessions.setNewExamDraft).not.toHaveBeenCalled();
  });

  it('шаг «pick»/«attempts»/«confirm» — текст мимо ожидания, просит нажать кнопку', async () => {
    const { handler } = buildHandler();
    const { ctx, replies } = fakeFlowCtx({ text: 'что угодно' });

    await handler.handle(ctx, CHAT_ID, draftSession({ buildStep: 'attempts' }), NOW);

    expect(replies).toEqual([
      'Нажмите одну из кнопок или пришлите текст, где это нужно.',
    ]);
  });

  it('название не проходит DTO-лимит — ошибка, шаг не меняется', async () => {
    const port = fakeExamBotPort({
      validateExamDraft: jest
        .fn()
        .mockResolvedValue(['Название: не длиннее 200 символов.']),
    });
    const { handler, botSessions } = buildHandler(port);
    const { ctx, replies } = fakeFlowCtx({ text: 'а'.repeat(201) });

    await handler.handle(ctx, CHAT_ID, draftSession({ buildStep: 'title' }), NOW);

    expect(replies).toEqual(['Название: не длиннее 200 символов.']);
    expect(botSessions.setNewExamDraft).not.toHaveBeenCalled();
  });

  it('название проходит — переходит к лимиту времени', async () => {
    const { handler, botSessions } = buildHandler();
    const { ctx, replies } = fakeFlowCtx({ text: 'Экзамен по форме' });

    await handler.handle(ctx, CHAT_ID, draftSession({ buildStep: 'title' }), NOW);

    expect(botSessions.setNewExamDraft).toHaveBeenCalledWith(
      CHAT_ID,
      { step: 'timeLimit', title: 'Экзамен по форме' },
      NOW,
    );
    expect(replies[0]).toContain('число минут');
  });

  it('лимит времени: не число — просит число или кнопку, шаг не меняется', async () => {
    const { handler, botSessions } = buildHandler();
    const { ctx, replies } = fakeFlowCtx({ text: 'полчаса' });

    await handler.handle(ctx, CHAT_ID, draftSession({ buildStep: 'timeLimit' }), NOW);

    expect(replies).toEqual([
      'Пришлите число минут или нажмите одну из кнопок: без лимита, 15, 30, 60.',
    ]);
    expect(botSessions.setNewExamDraft).not.toHaveBeenCalled();
  });

  it('лимит времени: число вне DTO-лимита — ошибка того же поля, что у формы кабинета', async () => {
    const port = fakeExamBotPort({
      validateExamDraft: jest.fn().mockResolvedValue(['Лимит времени: не больше 600.']),
    });
    const { handler, botSessions } = buildHandler(port);
    const { ctx, replies } = fakeFlowCtx({ text: '700' });

    await handler.handle(ctx, CHAT_ID, draftSession({ buildStep: 'timeLimit' }), NOW);

    expect(replies).toEqual(['Лимит времени: не больше 600.']);
    expect(botSessions.setNewExamDraft).not.toHaveBeenCalled();
  });

  it('лимит времени числом — переходит к числу попыток', async () => {
    const { handler, botSessions } = buildHandler();
    const { ctx, replies } = fakeFlowCtx({ text: '45' });

    await handler.handle(ctx, CHAT_ID, draftSession({ buildStep: 'timeLimit' }), NOW);

    expect(botSessions.setNewExamDraft).toHaveBeenCalledWith(
      CHAT_ID,
      { step: 'attempts', timeLimitMin: 45 },
      NOW,
    );
    expect(replies[0]).toContain('попыток');
  });
});
