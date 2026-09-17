// Чистая логика с фейками коллабораторов, без Mongo и без сети (CLAUDE.md
// «Тесты», образец — соседние спеки хендлеров бота): маршрутизация к
// MediaAssetsService и пересылка учителям — не сама привязка (та проверена
// против настоящей Mongo в media-assets.service.spec.ts). blocked —
// отказ и закрытая сессия, видео не привязывается (SECURITY §9).
import { Logger } from '@nestjs/common';
import { DateTime } from 'luxon';
import { Types } from 'mongoose';
import type { Context } from 'telegraf';
import { ACCESS_MESSAGE, type ExamAttemptDto } from '@xuanxue/shared';
import type { BotSessionLean } from '../bot-session.service';
import { fakeBotSessionService } from '../bot-session.service.test-support';
import { ExamBotPortRegistry } from '../exam-bot-port.registry';
import { fakeExamBotPort } from '../exam-bot.port.test-support';
import type { PersonalChats } from '../personal-chats';
import type { MediaAssetsService } from '../../media/media-assets.service';
import { activeAccess, fakeBotUserAccess } from '../bot-user-access.service.test-support';
import type { BotUserAccessService } from '../bot-user-access.service';
import { GENERIC_ERROR } from './callback-actions';
import { TELEGRAM_NOT_LINKED_MESSAGE } from './exam-media-deep-link';
import { ExamMediaMessageHandler } from './exam-media-message.handler';

const NOW = DateTime.utc(2026, 9, 12, 10, 0, 0);
const ATTEMPT_ID = new Types.ObjectId().toString();

function fakeCtx(overrides: {
  video?: boolean;
  chatId?: number;
  messageId?: number;
  // Чат целиком недоступен (бот заблокирован/удалён) — падают ОБА вызова,
  // как на реальном Telegram API, не только подпись (аудит 2026-09, находка
  // 2: раньше тест ронял только sendMessage, что не отличало «чат недоступен»
  // от «видео не проходит по формату», а порядок был caption-первым).
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
        if (toChatId === overrides.failForwardToChatId) {
          return Promise.reject(new Error('бот заблокирован'));
        }
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
  personalChats: { listFor: jest.Mock };
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
  // `listFor`, не `list` (аудит 2026-09, находка 1): пересылка идёт тем же
  // адресатам, что и текстовое «работу сдали» — штат с включённым видом
  // attempt_submitted, не весь штат с подключённым ботом.
  const personalChats = {
    listFor: jest.fn().mockResolvedValue(overrides.teacherChats ?? []),
  };
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
      personalChats as unknown as PersonalChats,
      registry,
    ),
    clear,
    registry,
    attachTelegramVideo,
    personalChats,
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

  it('видео, попытка чужая/не найдена — «не нашли попытку среди ваших», сессия закрывается', async () => {
    const { handler, clear } = buildHandler({ userId: 'u1', attached: null });
    const { ctx, replies } = fakeCtx({ video: true });

    await handler.handle(ctx, 111, SESSION, NOW);

    expect(replies).toEqual([
      'Не нашли эту попытку среди ваших. Откройте экзамен из своего кабинета ещё раз ' +
        'или вставьте там ссылку на видео.',
    ]);
    expect(clear).toHaveBeenCalledWith(111);
  });

  it('видео привязано — подтверждение, пересылка каждому учителю с подписью и copyMessage', async () => {
    const { handler, clear, personalChats } = buildHandler({
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
    // Находка 1: те же адресаты, что у текстового attempt_submitted — не
    // весь штат с подключённым ботом (personalChats.list).
    expect(personalChats.listFor).toHaveBeenCalledWith('attempt_submitted', NOW);
  });

  // ADR-0037: itemId из сессии (deep link с вопросом или поток бота) обязан
  // доехать до привязки — иначе видео осталось бы без вопроса даже когда он
  // известен.
  it('сессия несёт itemId (ADR-0037) — передаётся в attachTelegramVideo', async () => {
    const { handler, attachTelegramVideo } = buildHandler({
      userId: 'u1',
      attached: { media: { id: 'm1' }, examTitle: 'Форма' },
    });
    const sessionWithItem: BotSessionLean = {
      ...SESSION,
      itemId: new Types.ObjectId('507f1f77bcf86cd799439033'),
    };
    const { ctx } = fakeCtx({ video: true });

    await handler.handle(ctx, 111, sessionWithItem, NOW);

    expect(attachTelegramVideo).toHaveBeenCalledWith(
      ATTEMPT_ID,
      'u1',
      expect.anything(),
      NOW,
      '507f1f77bcf86cd799439033',
    );
  });

  it('сессия без itemId (старый deep link) — attachTelegramVideo получает undefined', async () => {
    const { handler, attachTelegramVideo } = buildHandler({
      userId: 'u1',
      attached: { media: { id: 'm1' }, examTitle: 'Форма' },
    });
    const { ctx } = fakeCtx({ video: true });

    await handler.handle(ctx, 111, SESSION, NOW);

    expect(attachTelegramVideo).toHaveBeenCalledWith(
      ATTEMPT_ID,
      'u1',
      expect.anything(),
      NOW,
      undefined,
    );
  });

  it('сотрудник выключил attempt_submitted — видео ему не пересылается (аудит 2026-09, находка 1)', async () => {
    // `listFor` сам решает, кто в списке (PersonalChats.listFor,
    // personal-chats.spec.ts/telegram-exam-notifier.spec.ts) — здесь
    // достаточно проверить, что пересылка спрашивает именно этот список, а
    // не `list()` (весь штат с подключённым ботом мимо переключателя).
    const { handler, personalChats } = buildHandler({
      userId: 'u1',
      attached: { media: { id: 'm1' }, examTitle: 'Экзамен' },
      // Учитель выключил вид уведомления — listFor его уже не отдаёт.
      teacherChats: [{ chatId: '202', userId: 't2', name: 'Дима' }],
    });
    const { ctx, sentMessages, copiedTo } = fakeCtx({ video: true });

    await handler.handle(ctx, 111, SESSION, NOW);

    expect(sentMessages.map((m) => m.chatId)).toEqual(['202']);
    expect(copiedTo).toEqual(['202']);
    expect(personalChats.listFor).toHaveBeenCalledWith('attempt_submitted', NOW);
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

  it('видео не прошло (copyMessage упал) — подпись без видео не отправляем (аудит 2026-09, находка 2)', async () => {
    const { handler } = buildHandler({
      userId: 'u1',
      attached: { media: { id: 'm1' }, examTitle: 'Экзамен' },
      teacherChats: [{ chatId: '201', userId: 't1', name: 'Мария' }],
    });
    const chatId = 111;
    const messageId = 42;
    const sentMessages: { chatId: string; text: string }[] = [];
    const copiedTo: string[] = [];
    const ctx = {
      chat: { id: chatId, type: 'private' },
      message: {
        message_id: messageId,
        video: { file_id: 'f1', file_unique_id: 'u1', duration: 30 },
      },
      reply: () => Promise.resolve(),
      telegram: {
        sendMessage: (toChatId: string, text: string) => {
          sentMessages.push({ chatId: toChatId, text });
          return Promise.resolve();
        },
        // Видео не проходит по формату/размеру — copyMessage падает первым.
        copyMessage: () => Promise.reject(new Error('видео слишком большое')),
      },
    } as unknown as Context;
    // Единственный адресат — сбой видео здесь эскалируется своим error
    // (проверено отдельным тестом ниже); тут глушим, чтобы не шуметь в вывод.
    const error = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    await handler.handle(ctx, 111, SESSION, NOW);

    // Подпись без видео учителю бесполезна — раньше уходила первой и
    // оставалась сиротой, теперь не уходит вовсе.
    expect(sentMessages).toEqual([]);
    expect(copiedTo).toEqual([]);
    error.mockRestore();
  });

  it('видео дошло, подпись упала — видео не теряем ради подписи', async () => {
    const { handler } = buildHandler({
      userId: 'u1',
      attached: { media: { id: 'm1' }, examTitle: 'Экзамен' },
      teacherChats: [{ chatId: '201', userId: 't1', name: 'Мария' }],
    });
    const chatId = 111;
    const messageId = 42;
    const sentMessages: { chatId: string; text: string }[] = [];
    const copiedTo: string[] = [];
    const ctx = {
      chat: { id: chatId, type: 'private' },
      message: {
        message_id: messageId,
        video: { file_id: 'f1', file_unique_id: 'u1', duration: 30 },
      },
      reply: () => Promise.resolve(),
      telegram: {
        sendMessage: () => Promise.reject(new Error('рейт-лимит')),
        copyMessage: (toChatId: string) => {
          copiedTo.push(toChatId);
          return Promise.resolve();
        },
      },
    } as unknown as Context;

    await handler.handle(ctx, 111, SESSION, NOW);

    expect(copiedTo).toEqual(['201']); // главное — видео — дошло
    expect(sentMessages).toEqual([]); // подпись потеряна, но не эскалируем
  });

  it('видео не дошло вообще никому — error-лог с attemptId (эскалация, не тишина)', async () => {
    const { handler } = buildHandler({
      userId: 'u1',
      attached: { media: { id: 'm1' }, examTitle: 'Экзамен' },
      teacherChats: [{ chatId: '201', userId: 't1', name: 'Мария' }],
    });
    const { ctx } = fakeCtx({ video: true, failForwardToChatId: '201' });
    const error = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    await handler.handle(ctx, 111, SESSION, NOW);

    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('видео не дошло'),
      expect.objectContaining({ attemptId: ATTEMPT_ID, kind: 'attempt_submitted' }),
    );
    error.mockRestore();
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
          itemId: 'i1',
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

  // Находка аудита PR #175 (docs/PLAN.md §11): раньше неожиданный сбой на
  // привязке уходил только в общий лог MessageHandler, ученик не получал
  // ни слова про то, снялось ли видео. Свой try/catch отвечает и логирует.
  it('привязка видео бросает неожиданную ошибку — фраза в чат, лог error со стеком, хендлер не падает', async () => {
    const { handler, attachTelegramVideo } = buildHandler({ userId: 'u1' });
    attachTelegramVideo.mockRejectedValueOnce(new Error('Mongo недоступна'));
    const { ctx, replies } = fakeCtx({ video: true });
    const error = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    await expect(handler.handle(ctx, 111, SESSION, NOW)).resolves.toBeUndefined();

    expect(replies).toEqual([GENERIC_ERROR]);
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('Mongo недоступна'),
      expect.stringContaining('Error: Mongo недоступна'),
    );
    error.mockRestore();
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

  // Регрессия инцидента 2026-09-16 (RUNBOOK §8.17): ученик вошёл по почте (нет
  // telegramId), сдал экзамен, прислал видео в бота — BotUserAccessService
  // даёт `unknown`, а хендлер раньше всё равно звал attachTelegramVideo с
  // userId: undefined и получал «не нашли попытку», как для чужого attemptId,
  // не объясняя, что дело в непривязанном Telegram. Основной путь перехватывает
  // exam-media-deep-link.ts раньше, до ожидания видео, — этот тест защищает
  // хендлер сообщения на случай сессии, оставшейся от старого кода.
  it('unknown (сессия осталась от старого кода) — сессия закрывается, текст про непривязанный Telegram, привязка не вызывается', async () => {
    const { handler, clear, attachTelegramVideo } = buildHandler({
      botAccess: fakeBotUserAccess({ kind: 'unknown' }),
    });
    const { ctx, replies } = fakeCtx({ video: true });

    await handler.handle(ctx, 111, SESSION, NOW);

    expect(replies).toEqual([TELEGRAM_NOT_LINKED_MESSAGE]);
    expect(clear).toHaveBeenCalledWith(111);
    expect(attachTelegramVideo).not.toHaveBeenCalled();
  });
});
