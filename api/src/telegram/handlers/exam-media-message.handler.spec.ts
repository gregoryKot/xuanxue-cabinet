// Чистая логика с фейками коллабораторов, без Mongo и без сети (CLAUDE.md
// «Тесты», образец — соседние спеки хендлеров бота): маршрутизация к
// MediaAssetsService и пересылка учителям — не сама привязка (та проверена
// против настоящей Mongo в media-assets.service.spec.ts). blocked/invited —
// отказ и закрытая сессия, видео не привязывается (SECURITY §9, ADR-0026).
import { DateTime } from 'luxon';
import { Types } from 'mongoose';
import type { Context } from 'telegraf';
import {
  ACCESS_MESSAGE,
  PENDING_APPROVAL_MESSAGE,
  type ExamAttemptDto,
} from '@xuanxue/shared';
import type { BotSessionLean } from '../bot-session.service';
import { fakeBotSessionService } from '../bot-session.service.test-support';
import { ExamBotPortRegistry } from '../exam-bot-port.registry';
import { fakeExamBotPort } from '../exam-bot.port.test-support';
import type { PersonalChats } from '../personal-chats';
import type { MediaAssetsService } from '../../media/media-assets.service';
import { activeAccess, fakeBotUserAccess } from '../bot-user-access.service.test-support';
import type { BotUserAccessService } from '../bot-user-access.service';
import { ExamMediaMessageHandler } from './exam-media-message.handler';

const NOW = DateTime.utc(2026, 9, 12, 10, 0, 0);
const ATTEMPT_ID = new Types.ObjectId().toString();

function fakeCtx(overrides: {
  video?: boolean;
  chatId?: number;
  messageId?: number;
  failForwardToChatId?: string;
}): {
  ctx: Context;
  replies: string[];
  sentMessages: { chatId: string; text: string }[];
  copiedTo: string[];
} {
  const replies: string[] = [];
  const sentMessages: { chatId: string; text: string }[] = [];
  const copiedTo: string[] = [];
  const chatId = overrides.chatId ?? 111;
  const messageId = overrides.messageId ?? 42;
  const ctx = {
    chat: { id: chatId, type: 'private' },
    message: overrides.video
      ? {
          message_id: messageId,
          video: { file_id: 'f1', file_unique_id: 'u1', duration: 30 },
        }
      : { message_id: messageId, text: 'привет' },
    reply: (text: string) => {
      replies.push(text);
      return Promise.resolve();
    },
    telegram: {
      sendMessage: (toChatId: string, text: string) => {
        if (toChatId === overrides.failForwardToChatId) {
          return Promise.reject(new Error('бот заблокирован'));
        }
        sentMessages.push({ chatId: toChatId, text });
        return Promise.resolve();
      },
      copyMessage: (toChatId: string) => {
        copiedTo.push(toChatId);
        return Promise.resolve();
      },
    },
  } as unknown as Context;
  return { ctx, replies, sentMessages, copiedTo };
}

function buildHandler(overrides: {
  userId?: string;
  attached?: { media: { id: string }; examTitle: string } | null;
  teacherChats?: { chatId: string; userId: string; name: string }[];
  loadOwnAttempt?: ExamAttemptDto | null;
  botAccess?: BotUserAccessService;
}): {
  handler: ExamMediaMessageHandler;
  clear: jest.Mock;
  registry: ExamBotPortRegistry;
  attachTelegramVideo: jest.Mock;
} {
  const botSessions = fakeBotSessionService();
  const clear = botSessions.clear;
  const attachTelegramVideo = jest.fn().mockResolvedValue(overrides.attached ?? null);
  const mediaAssets = { attachTelegramVideo } as unknown as MediaAssetsService;
  const botAccess =
    overrides.botAccess ??
    fakeBotUserAccess(
      overrides.userId
        ? activeAccess({
            id: overrides.userId,
            name: 'Ученик Иванов',
            roles: [],
            tz: 'UTC',
            status: 'active',
          })
        : { kind: 'unknown' },
    );
  const personalChats = {
    list: jest.fn().mockResolvedValue(overrides.teacherChats ?? []),
  } as unknown as PersonalChats;
  const registry = new ExamBotPortRegistry();
  registry.set(
    fakeExamBotPort({
      loadOwnAttempt: jest.fn().mockResolvedValue(overrides.loadOwnAttempt ?? null),
    }),
  );
  return {
    handler: new ExamMediaMessageHandler(
      botSessions,
      mediaAssets,
      botAccess,
      personalChats,
      registry,
    ),
    clear,
    registry,
    attachTelegramVideo,
  };
}

const SESSION: BotSessionLean = {
  kind: 'examMedia',
  attemptId: new Types.ObjectId(ATTEMPT_ID),
};

const IN_FLOW_SESSION: BotSessionLean = {
  kind: 'examMedia',
  attemptId: new Types.ObjectId(ATTEMPT_ID),
  questionIndex: 0,
};

describe('ExamMediaMessageHandler', () => {
  it('не видео — просит прислать видео, сессия не закрывается', async () => {
    const { handler, clear } = buildHandler({});
    const { ctx, replies } = fakeCtx({ video: false });

    await handler.handle(ctx, 111, SESSION, NOW);

    expect(replies).toEqual([
      'Ждём видео для экзамена: видеосообщение, «кружок» или файл с видео. Пришлите его сюда.',
    ]);
    expect(clear).not.toHaveBeenCalled();
  });

  it('видео, попытка чужая/не найдена — «не нашли попытку», сессия закрывается', async () => {
    const { handler, clear } = buildHandler({ userId: 'u1', attached: null });
    const { ctx, replies } = fakeCtx({ video: true });

    await handler.handle(ctx, 111, SESSION, NOW);

    expect(replies).toEqual([
      'Не нашли эту попытку — возможно, её отменили. Откройте экзамен в кабинете ещё раз.',
    ]);
    expect(clear).toHaveBeenCalledWith(111);
  });

  it('видео привязано — подтверждение, пересылка каждому учителю с подписью и copyMessage', async () => {
    const { handler, clear } = buildHandler({
      userId: 'u1',
      attached: { media: { id: 'm1' }, examTitle: 'Форма первого уровня' },
      teacherChats: [
        { chatId: '201', userId: 't1', name: 'Мария' },
        { chatId: '202', userId: 't2', name: 'Дима' },
      ],
    });
    const { ctx, replies, sentMessages, copiedTo } = fakeCtx({
      video: true,
      chatId: 111,
      messageId: 99,
    });

    await handler.handle(ctx, 111, SESSION, NOW);

    expect(replies).toEqual([
      'Видео получено, спасибо! Учитель уже может его посмотреть.',
    ]);
    expect(clear).toHaveBeenCalledWith(111);
    expect(sentMessages).toEqual([
      { chatId: '201', text: 'Видео от Ученик Иванов — экзамен «Форма первого уровня».' },
      { chatId: '202', text: 'Видео от Ученик Иванов — экзамен «Форма первого уровня».' },
    ]);
    expect(copiedTo).toEqual(['201', '202']);
  });

  it('никто из штата не подключил бота — привязка есть, пересылать некому, не падает', async () => {
    const { handler } = buildHandler({
      userId: 'u1',
      attached: { media: { id: 'm1' }, examTitle: 'Экзамен' },
      teacherChats: [],
    });
    const { ctx, replies } = fakeCtx({ video: true });

    await expect(handler.handle(ctx, 111, SESSION, NOW)).resolves.toBeUndefined();
    expect(replies).toEqual([
      'Видео получено, спасибо! Учитель уже может его посмотреть.',
    ]);
  });

  it('пересылка одному учителю упала (заблокировал бота) — остальные всё равно получают видео', async () => {
    const { handler } = buildHandler({
      userId: 'u1',
      attached: { media: { id: 'm1' }, examTitle: 'Экзамен' },
      teacherChats: [
        { chatId: '201', userId: 't1', name: 'Мария' },
        { chatId: '202', userId: 't2', name: 'Дима' },
      ],
    });
    const { ctx, sentMessages, copiedTo } = fakeCtx({
      video: true,
      failForwardToChatId: '201',
    });

    await expect(handler.handle(ctx, 111, SESSION, NOW)).resolves.toBeUndefined();

    expect(sentMessages).toEqual([
      { chatId: '202', text: 'Видео от Ученик Иванов — экзамен «Экзамен».' },
    ]);
    expect(copiedTo).toEqual(['202']);
  });

  // Защита в глубину: Telegraf даёт `ctx.chat`/`ctx.message` на любом
  // сообщении, но типы допускают их отсутствие — пересылать тогда нечего,
  // и падать на этом бот не должен (привязка уже произошла).
  it('в контексте нет чата — видео привязано, пересылки нет, без падения', async () => {
    const { handler } = buildHandler({
      userId: 'u1',
      attached: { media: { id: 'm1' }, examTitle: 'Форма' },
      teacherChats: [{ chatId: '900', userId: 't1', name: 'Учитель' }],
    });
    const { ctx, replies, copiedTo } = fakeCtx({ video: true });
    const ctxWithoutChat = { ...ctx, chat: undefined } as unknown as typeof ctx;

    await handler.handle(ctxWithoutChat, 111, SESSION, NOW);

    expect(replies).toContain(
      'Видео получено, спасибо! Учитель уже может его посмотреть.',
    );
    expect(copiedTo).toEqual([]);
  });

  it('нет attemptId в сессии (защита в глубину) — ничего не делает', async () => {
    const { handler, clear } = buildHandler({});
    const { ctx, replies } = fakeCtx({ video: true });

    await handler.handle(ctx, 111, { kind: 'examMedia' }, NOW);

    expect(replies).toEqual([]);
    expect(clear).not.toHaveBeenCalled();
  });

  it('сессия с questionIndex (поток вопросов бота) — следующий экран, не «получено»', async () => {
    const attempt: ExamAttemptDto = {
      id: ATTEMPT_ID,
      examId: 'e1',
      examTitle: 'Форма',
      userId: 'u1',
      status: 'in_progress',
      blocks: [
        {
          id: 'b1',
          title: '',
          required: true,
          questions: [
            { itemId: 'i1', version: 1, kind: 'video', prompt: 'Видео', options: [] },
          ],
        },
      ],
      answers: [],
      startedAt: NOW.toISO() ?? '',
      expired: false,
      media: [
        {
          id: 'm1',
          attemptId: ATTEMPT_ID,
          kind: 'telegram',
          receivedAt: NOW.toISO() ?? '',
        },
      ],
    };
    const { handler } = buildHandler({
      userId: 'u1',
      attached: { media: { id: 'm1' }, examTitle: 'Форма' },
      loadOwnAttempt: attempt,
    });
    const { ctx, replies } = fakeCtx({ video: true });

    await handler.handle(ctx, 111, IN_FLOW_SESSION, NOW);

    expect(replies).not.toContain(
      'Видео получено, спасибо! Учитель уже может его посмотреть.',
    );
    expect(replies.some((r) => r.includes('Видео получено.'))).toBe(true);
  });

  it('заблокированный — отказ тем же текстом, что в вебе, сессия закрывается, видео не привязывается', async () => {
    const { handler, clear, attachTelegramVideo } = buildHandler({
      botAccess: fakeBotUserAccess({ kind: 'denied', message: ACCESS_MESSAGE }),
    });
    const { ctx, replies } = fakeCtx({ video: true });

    await handler.handle(ctx, 111, SESSION, NOW);

    expect(replies).toEqual([ACCESS_MESSAGE]);
    expect(clear).toHaveBeenCalledWith(111);
    expect(attachTelegramVideo).not.toHaveBeenCalled();
  });

  it('неподтверждённый (invited) — отказ ожиданием подтверждения, сессия закрывается', async () => {
    const { handler, clear, attachTelegramVideo } = buildHandler({
      botAccess: fakeBotUserAccess({ kind: 'denied', message: PENDING_APPROVAL_MESSAGE }),
    });
    const { ctx, replies } = fakeCtx({ video: true });

    await handler.handle(ctx, 111, SESSION, NOW);

    expect(replies).toEqual([PENDING_APPROVAL_MESSAGE]);
    expect(clear).toHaveBeenCalledWith(111);
    expect(attachTelegramVideo).not.toHaveBeenCalled();
  });
});
