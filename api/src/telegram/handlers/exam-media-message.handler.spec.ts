// Чистая логика с фейками коллабораторов, без Mongo и без сети (CLAUDE.md
// «Тесты», образец — соседние спеки хендлеров бота): маршрутизация к
// MediaAssetsService и пересылка учителям — не сама привязка (та проверена
// против настоящей Mongo в media-assets.service.spec.ts).
import { DateTime } from 'luxon';
import { Types } from 'mongoose';
import type { Context } from 'telegraf';
import type { BotSessionLean, BotSessionService } from '../bot-session.service';
import type { PersonalChats } from '../personal-chats';
import type { MediaAssetsService } from '../../media/media-assets.service';
import type { UsersService } from '../../users/users.service';
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
}): { handler: ExamMediaMessageHandler; clear: jest.Mock } {
  const clear = jest.fn().mockResolvedValue(undefined);
  const botSessions = { clear } as unknown as BotSessionService;
  const mediaAssets = {
    attachTelegramVideo: jest.fn().mockResolvedValue(overrides.attached ?? null),
  } as unknown as MediaAssetsService;
  const usersService = {
    findByTelegramId: jest
      .fn()
      .mockResolvedValue(
        overrides.userId ? { id: overrides.userId, name: 'Ученик Иванов' } : null,
      ),
  } as unknown as UsersService;
  const personalChats = {
    list: jest.fn().mockResolvedValue(overrides.teacherChats ?? []),
  } as unknown as PersonalChats;
  return {
    handler: new ExamMediaMessageHandler(
      botSessions,
      mediaAssets,
      usersService,
      personalChats,
    ),
    clear,
  };
}

const SESSION: BotSessionLean = {
  kind: 'examMedia',
  attemptId: new Types.ObjectId(ATTEMPT_ID),
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

  it('нет attemptId в сессии (защита в глубину) — ничего не делает', async () => {
    const { handler, clear } = buildHandler({});
    const { ctx, replies } = fakeCtx({ video: true });

    await handler.handle(ctx, 111, { kind: 'examMedia' }, NOW);

    expect(replies).toEqual([]);
    expect(clear).not.toHaveBeenCalled();
  });
});
