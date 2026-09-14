// Чистая логика с фейками коллабораторов, без Mongo и без сети (CLAUDE.md
// «Тесты», образец — exam-media-message.handler.spec.ts): сохранение через
// ExamBotPort.saveAnswer и переход к следующему вопросу — не сама работа с
// Mongo (та проверена в exam-attempt-flow.spec.ts).
import { DateTime } from 'luxon';
import { Types } from 'mongoose';
import type { Context } from 'telegraf';
import type { AttemptQuestionDto, ExamAttemptDto } from '@xuanxue/shared';
import type { BotSessionLean } from '../bot-session.service';
import { fakeBotSessionService } from '../bot-session.service.test-support';
import { ExamBotPortRegistry } from '../exam-bot-port.registry';
import { fakeExamBotPort } from '../exam-bot.port.test-support';
import type { UsersService } from '../../users/users.service';
import { ExamTextAnswerHandler } from './exam-text-answer.handler';

const NOW = DateTime.utc(2026, 9, 12, 10, 0, 0);
const ATTEMPT_ID = new Types.ObjectId().toString();
const TEXT_Q: AttemptQuestionDto = {
  itemId: 'i1',
  version: 1,
  kind: 'text',
  prompt: 'Опишите форму словами',
  options: [],
};

function attempt(overrides: Partial<ExamAttemptDto> = {}): ExamAttemptDto {
  return {
    id: ATTEMPT_ID,
    examId: 'e1',
    examTitle: 'Форма',
    userId: 'u1',
    status: 'in_progress',
    blocks: [{ id: 'b1', title: '', required: true, questions: [TEXT_Q] }],
    answers: [],
    startedAt: NOW.toISO() ?? '',
    expired: false,
    ...overrides,
  };
}

function fakeCtx(text?: string): {
  ctx: Context;
  replies: string[];
  buttonTexts: string[][];
} {
  const replies: string[] = [];
  const buttonTexts: string[][] = [];
  const ctx = {
    message: text === undefined ? { message_id: 1 } : { message_id: 1, text },
    reply: (
      replyText: string,
      extra?: { reply_markup?: { inline_keyboard?: { text: string }[][] } },
    ) => {
      replies.push(replyText);
      buttonTexts.push(
        (extra?.reply_markup?.inline_keyboard ?? []).flat().map((b) => b.text),
      );
      return Promise.resolve();
    },
  } as unknown as Context;
  return { ctx, replies, buttonTexts };
}

const SESSION: BotSessionLean = {
  kind: 'examText',
  attemptId: new Types.ObjectId(ATTEMPT_ID),
  questionIndex: 0,
};

function buildHandler(overrides: {
  userId?: string;
  loadOwnAttempt?: ExamAttemptDto | null;
  saveAnswer?: ExamAttemptDto;
}) {
  const botSessions = fakeBotSessionService();
  const usersService = {
    findByTelegramId: jest.fn().mockResolvedValue(
      overrides.userId
        ? {
            id: overrides.userId,
            name: 'Ученик',
            roles: [],
            tz: 'UTC',
            status: 'active',
          }
        : null,
    ),
  } as unknown as UsersService;
  const port = fakeExamBotPort({
    loadOwnAttempt: jest.fn().mockResolvedValue(overrides.loadOwnAttempt ?? null),
    saveAnswer: jest.fn().mockResolvedValue(overrides.saveAnswer ?? attempt()),
  });
  const registry = new ExamBotPortRegistry();
  registry.set(port);
  const handler = new ExamTextAnswerHandler(botSessions, usersService, registry);
  return { handler, botSessions, port };
}

describe('ExamTextAnswerHandler', () => {
  it('нет текста в сообщении — просит написать текстом, сессия не закрывается', async () => {
    const { handler, botSessions } = buildHandler({});
    const { ctx, replies } = fakeCtx(undefined);

    await handler.handle(ctx, 111, SESSION, NOW);

    expect(replies).toEqual(['Ждём ответ текстом — пришлите его обычным сообщением.']);
    expect(botSessions.clear).not.toHaveBeenCalled();
  });

  it('попытка чужая/не найдена — ATTEMPT_NOT_FOUND_MESSAGE, сессия закрывается', async () => {
    const { handler, botSessions } = buildHandler({ userId: 'u1', loadOwnAttempt: null });
    const { ctx, replies } = fakeCtx('мой ответ');

    await handler.handle(ctx, 111, SESSION, NOW);

    expect(replies).toEqual(['Попытка не найдена. Обновите страницу.']);
    expect(botSessions.clear).toHaveBeenCalledWith(111);
  });

  it('ответ сохранён, единственный вопрос — следующий экран новым сообщением, «Сдать»', async () => {
    const saved = attempt({ answers: [{ itemId: 'i1', text: 'мой ответ' }] });
    const { handler, port } = buildHandler({
      userId: 'u1',
      loadOwnAttempt: attempt(),
      saveAnswer: saved,
    });
    const { ctx, replies, buttonTexts } = fakeCtx('мой ответ');

    await handler.handle(ctx, 111, SESSION, NOW);

    expect(port.saveAnswer).toHaveBeenCalledWith(
      ATTEMPT_ID,
      { id: 'u1', name: 'Ученик', roles: [], tz: 'UTC', status: 'active' },
      { itemId: 'i1', text: 'мой ответ' },
      NOW,
    );
    expect(replies[0]).toContain('Ваш ответ: «мой ответ»');
    expect(buttonTexts[0]).toContain('Сдать');
  });

  it('ответ сохранён, есть следующий вопрос — экран этого вопроса', async () => {
    const q2: AttemptQuestionDto = { ...TEXT_Q, itemId: 'i2', prompt: 'Вопрос 2' };
    const current = attempt({
      blocks: [{ id: 'b1', title: '', required: true, questions: [TEXT_Q, q2] }],
    });
    const saved = { ...current, answers: [{ itemId: 'i1', text: 'мой ответ' }] };
    const { handler } = buildHandler({
      userId: 'u1',
      loadOwnAttempt: current,
      saveAnswer: saved,
    });
    const { ctx, replies } = fakeCtx('мой ответ');

    await handler.handle(ctx, 111, SESSION, NOW);

    expect(replies[0]).toContain('Вопрос 2 из 2');
  });

  it('незнакомец в сессии (защита в глубину) — ничего не делает', async () => {
    const { handler } = buildHandler({ userId: undefined });
    const { ctx, replies } = fakeCtx('мой ответ');

    await handler.handle(ctx, 111, SESSION, NOW);

    expect(replies).toEqual([]);
  });

  it('нет attemptId/questionIndex в сессии (защита в глубину) — ничего не делает', async () => {
    const { handler } = buildHandler({});
    const { ctx, replies } = fakeCtx('мой ответ');

    await handler.handle(ctx, 111, { kind: 'examText' }, NOW);

    expect(replies).toEqual([]);
  });

  it('сервис отказал — общий текст ошибки, не падает', async () => {
    const botSessions = fakeBotSessionService();
    const usersService = {
      findByTelegramId: jest.fn().mockResolvedValue({
        id: 'u1',
        name: 'Ученик',
        roles: [],
        tz: 'UTC',
        status: 'active',
      }),
    } as unknown as UsersService;
    const registry = new ExamBotPortRegistry();
    registry.set(
      fakeExamBotPort({
        loadOwnAttempt: jest.fn().mockRejectedValue(new Error('boom')),
      }),
    );
    const handler = new ExamTextAnswerHandler(botSessions, usersService, registry);
    const { ctx, replies } = fakeCtx('мой ответ');

    await expect(handler.handle(ctx, 111, SESSION, NOW)).resolves.toBeUndefined();
    expect(replies).toEqual(['Что-то пошло не так. Попробуйте ещё раз.']);
  });
});
