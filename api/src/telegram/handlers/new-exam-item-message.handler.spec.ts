// Свободный текст диалога «Новый вопрос» (ТЗ 4б.3) — фейковые
// BotSessionService/ExamBotPort, без Mongo (тем же приёмом, что
// exam-text-answer.handler.spec.ts): полный диалог до сохранения уже
// проверен интеграционным new-exam-item-flow.spec.ts, здесь — отдельные
// ветки (не текст, ошибка DTO на каждом шаге, чужой шаг).
import { DateTime } from 'luxon';
import type { BotSessionLean } from '../bot-session.service';
import { fakeBotSessionService } from '../bot-session.service.test-support';
import { ExamBotPortRegistry } from '../exam-bot-port.registry';
import { fakeExamBotPort } from '../exam-bot.port.test-support';
import { fakeFlowCtx } from './exam-attempt-flow.test-support';
import { NewExamItemMessageHandler } from './new-exam-item-message.handler';

const NOW = DateTime.utc(2026, 9, 17, 10, 0, 0);
const CHAT_ID = 111;

function draftSession(overrides: Partial<BotSessionLean> = {}): BotSessionLean {
  return { kind: 'examItemDraft', draftKind: 'single', draftOptions: [], ...overrides };
}

function buildHandler(port = fakeExamBotPort()) {
  const botSessions = fakeBotSessionService();
  const registry = new ExamBotPortRegistry();
  registry.set(port);
  return {
    handler: new NewExamItemMessageHandler(botSessions, registry),
    botSessions,
    port,
  };
}

describe('NewExamItemMessageHandler', () => {
  it('не текстовое сообщение — просит текст, шаг не меняется', async () => {
    const { handler, botSessions } = buildHandler();
    const { ctx, replies } = fakeFlowCtx({ video: true });

    await handler.handle(ctx, CHAT_ID, draftSession({ draftStep: 'prompt' }), NOW);

    expect(replies).toEqual(['Пришлите текст обычным сообщением.']);
    expect(botSessions.setNewExamItemDraft).not.toHaveBeenCalled();
  });

  it('шаг «correct»/«confirm» — текст мимо ожидания, просит нажать кнопку', async () => {
    const { handler } = buildHandler();
    const { ctx, replies } = fakeFlowCtx({ text: 'что угодно' });

    await handler.handle(ctx, CHAT_ID, draftSession({ draftStep: 'correct' }), NOW);

    expect(replies).toEqual(['Пришлите текст обычным сообщением.']);
  });

  it('формулировка не проходит DTO-лимит — ошибка, шаг не меняется', async () => {
    const port = fakeExamBotPort({
      validateExamItemDraft: jest
        .fn()
        .mockResolvedValue(['Формулировка: не длиннее 2000 символов.']),
    });
    const { handler, botSessions } = buildHandler(port);
    const { ctx, replies } = fakeFlowCtx({ text: 'а'.repeat(2001) });

    await handler.handle(ctx, CHAT_ID, draftSession({ draftStep: 'prompt' }), NOW);

    expect(replies).toEqual(['Формулировка: не длиннее 2000 символов.']);
    expect(botSessions.setNewExamItemDraft).not.toHaveBeenCalled();
  });

  it('формулировка валидна, text-вопрос — сразу шаг критериев (вариантов не бывает)', async () => {
    const { handler, botSessions } = buildHandler();
    const { ctx, replies } = fakeFlowCtx({ text: 'Опишите форму' });

    await handler.handle(
      ctx,
      CHAT_ID,
      draftSession({ draftStep: 'prompt', draftKind: 'text' }),
      NOW,
    );

    expect(botSessions.setNewExamItemDraft).toHaveBeenCalledWith(
      CHAT_ID,
      { step: 'criteria', prompt: 'Опишите форму' },
      NOW,
    );
    expect(replies[0]).toContain('критерии');
  });

  it('вариант не проходит DTO-лимит (слишком много вариантов) — ошибка, вариант не добавлен', async () => {
    const port = fakeExamBotPort({
      validateExamItemDraft: jest
        .fn()
        .mockResolvedValue(['Варианты ответа: не больше 10 элементов.']),
    });
    const { handler, botSessions } = buildHandler(port);
    const { ctx, replies } = fakeFlowCtx({ text: 'Одиннадцатый вариант' });

    await handler.handle(
      ctx,
      CHAT_ID,
      draftSession({ draftStep: 'options', draftOptions: [] }),
      NOW,
    );

    expect(replies).toEqual(['Варианты ответа: не больше 10 элементов.']);
    expect(botSessions.setNewExamItemDraft).not.toHaveBeenCalled();
  });

  it('критерии не проходят DTO-лимит — ошибка, черновик остаётся на шаге критериев', async () => {
    const port = fakeExamBotPort({
      validateExamItemDraft: jest
        .fn()
        .mockResolvedValue(['Критерии проверки: не длиннее 1000 символов.']),
    });
    const { handler, botSessions } = buildHandler(port);
    const { ctx, replies } = fakeFlowCtx({ text: 'а'.repeat(1001) });

    await handler.handle(ctx, CHAT_ID, draftSession({ draftStep: 'criteria' }), NOW);

    expect(replies).toEqual(['Критерии проверки: не длиннее 1000 символов.']);
    expect(botSessions.setNewExamItemDraft).not.toHaveBeenCalled();
  });

  it('чужая/истёкшая сессия (не examItemDraft) — молча выходит', async () => {
    const { handler, botSessions } = buildHandler();
    const { ctx, replies } = fakeFlowCtx({ text: 'текст' });

    await handler.handle(ctx, CHAT_ID, { kind: 'topic' }, NOW);

    expect(replies).toEqual([]);
    expect(botSessions.setNewExamItemDraft).not.toHaveBeenCalled();
  });
});
