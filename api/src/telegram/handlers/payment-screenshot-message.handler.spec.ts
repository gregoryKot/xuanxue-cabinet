// Чистая логика с фейками коллабораторов, без Mongo и без сети (CLAUDE.md
// «Тесты», образец — exam-media-message.handler.spec.ts): маршрутизация к
// PaymentsService и пересылка бухгалтеру — не сама привязка (та проверена
// против настоящей Mongo в payments.service.spec.ts).
import { Logger } from '@nestjs/common';
import { DateTime } from 'luxon';
import type { Context } from 'telegraf';
import { PAYMENT_STAFF_NOT_ELIGIBLE_MESSAGE, type PaymentStatus } from '@xuanxue/shared';
import { InvalidInputError } from '../../common/errors';
import { activeAccess, fakeBotUserAccess } from '../bot-user-access.service.test-support';
import type { BotUserAccessService } from '../bot-user-access.service';
import type { BotSessionLean } from '../bot-session.lean';
import { fakeBotSessionService } from '../bot-session.service.test-support';
import type { PersonalChats } from '../personal-chats';
import type { PaymentsService } from '../../payments/payments.service';
import { PAYMENT_TELEGRAM_NOT_LINKED_MESSAGE } from './payment-screenshot-deep-link';
import { PaymentScreenshotMessageHandler } from './payment-screenshot-message.handler';

const NOW = DateTime.utc(2026, 9, 12, 10, 0, 0);
const SESSION: BotSessionLean = { kind: 'payment', month: '2026-09' };

function fakeCtx(overrides: { photo?: boolean; failForwardToChatId?: string }): {
  ctx: Context;
  replies: string[];
  sentMessages: { chatId: string; text: string }[];
  copiedTo: string[];
} {
  const replies: string[] = [];
  const sentMessages: { chatId: string; text: string }[] = [];
  const copiedTo: string[] = [];
  const ctx = {
    chat: { id: 111, type: 'private' },
    message: overrides.photo
      ? { message_id: 42, photo: [{ file_id: 'p1', file_unique_id: 'pu1' }] }
      : { message_id: 42, text: 'привет' },
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
  attachStatus?: PaymentStatus | Error;
  accountantChats?: { chatId: string; userId: string; name: string }[];
  botAccess?: BotUserAccessService;
}): {
  handler: PaymentScreenshotMessageHandler;
  clear: jest.Mock;
  attachScreenshot: jest.Mock;
  personalChats: { listFor: jest.Mock };
} {
  const botSessions = fakeBotSessionService();
  const clear = botSessions.clear;
  const attachScreenshot = jest.fn().mockImplementation(() => {
    if (overrides.attachStatus instanceof Error) {
      return Promise.reject(overrides.attachStatus);
    }
    return Promise.resolve(overrides.attachStatus ?? 'awaiting');
  });
  const paymentsService = { attachScreenshot } as unknown as PaymentsService;
  const botAccess =
    overrides.botAccess ??
    fakeBotUserAccess(
      overrides.userId
        ? activeAccess({
            id: overrides.userId,
            name: 'Ученик Иванов',
            roles: [],
            status: 'active',
          })
        : { kind: 'unknown' },
    );
  const personalChats = {
    listFor: jest.fn().mockResolvedValue(overrides.accountantChats ?? []),
  };
  return {
    handler: new PaymentScreenshotMessageHandler(
      botSessions,
      paymentsService,
      botAccess,
      personalChats as unknown as PersonalChats,
    ),
    clear,
    attachScreenshot,
    personalChats,
  };
}

describe('PaymentScreenshotMessageHandler', () => {
  it('не фото — просит прислать фото, сессия не закрывается', async () => {
    const { handler, clear } = buildHandler({});
    const { ctx, replies } = fakeCtx({ photo: false });

    await handler.handle(ctx, 111, SESSION, NOW);

    expect(replies[0]).toContain('Ждём фото');
    expect(clear).not.toHaveBeenCalled();
  });

  it('unknown (Telegram не связан с кабинетом) — отказ, ожидание закрыто', async () => {
    const { handler, clear, attachScreenshot } = buildHandler({});
    const { ctx, replies } = fakeCtx({ photo: true });

    await handler.handle(ctx, 111, SESSION, NOW);

    expect(replies).toEqual([PAYMENT_TELEGRAM_NOT_LINKED_MESSAGE]);
    expect(clear).toHaveBeenCalledWith(111);
    expect(attachScreenshot).not.toHaveBeenCalled();
  });

  it('denied (заблокированный) — свой отказ, ожидание закрыто', async () => {
    const { handler, clear } = buildHandler({
      botAccess: fakeBotUserAccess({ kind: 'denied', message: 'Доступ закрыт' }),
    });
    const { ctx, replies } = fakeCtx({ photo: true });

    await handler.handle(ctx, 111, SESSION, NOW);

    expect(replies).toEqual(['Доступ закрыт']);
    expect(clear).toHaveBeenCalledWith(111);
  });

  it('успех — привязка, пересылка бухгалтеру, ожидание закрыто, ответ называет месяц', async () => {
    const { handler, clear, attachScreenshot, personalChats } = buildHandler({
      userId: 'u1',
      attachStatus: 'awaiting',
      accountantChats: [{ chatId: '301', userId: 'a1', name: 'Маша' }],
    });
    const { ctx, replies, sentMessages, copiedTo } = fakeCtx({ photo: true });

    await handler.handle(ctx, 111, SESSION, NOW);

    expect(attachScreenshot).toHaveBeenCalledWith(
      'u1',
      '2026-09',
      { fileId: 'p1', fileUniqueId: 'pu1' },
      NOW,
    );
    expect(clear).toHaveBeenCalledWith(111);
    expect(copiedTo).toEqual(['301']);
    expect(sentMessages).toEqual([
      { chatId: '301', text: 'Скриншот от Ученик Иванов — оплата за сентябрь 2026.' },
    ]);
    expect(personalChats.listFor).toHaveBeenCalledWith('payments', NOW);
    expect(replies[0]).toContain('сентябрь 2026');
  });

  it('месяц уже paid — ответ честно говорит про статус, скриншот всё равно принят', async () => {
    const { handler, attachScreenshot } = buildHandler({
      userId: 'u1',
      attachStatus: 'paid',
    });
    const { ctx, replies } = fakeCtx({ photo: true });

    await handler.handle(ctx, 111, SESSION, NOW);

    expect(attachScreenshot).toHaveBeenCalled();
    expect(replies[0]).toContain('уже отмечено «Оплачено»');
  });

  it('бухгалтера нет — ученик всё равно получает ответ (доставка не его забота)', async () => {
    const { handler } = buildHandler({ userId: 'u1', attachStatus: 'awaiting' });
    const { ctx, replies, sentMessages, copiedTo } = fakeCtx({ photo: true });

    await handler.handle(ctx, 111, SESSION, NOW);

    expect(copiedTo).toEqual([]);
    expect(sentMessages).toEqual([]);
    expect(replies[0]).toContain('получили');
  });

  it('неожиданный сбой (attachScreenshot упал) — лог со стеком, ученик получает ответ', async () => {
    const { handler } = buildHandler({
      userId: 'u1',
      attachStatus: new Error('база недоступна'),
    });
    const { ctx, replies } = fakeCtx({ photo: true });
    const error = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    await handler.handle(ctx, 111, SESSION, NOW);

    expect(replies).toHaveLength(1);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it('штат школы (InvalidInputError из assertActiveStudent) — текст ошибки как есть, не общий сбой', async () => {
    const { handler } = buildHandler({
      userId: 'u1',
      attachStatus: new InvalidInputError(PAYMENT_STAFF_NOT_ELIGIBLE_MESSAGE),
    });
    const { ctx, replies } = fakeCtx({ photo: true });
    const error = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    await handler.handle(ctx, 111, SESSION, NOW);

    expect(replies).toEqual([PAYMENT_STAFF_NOT_ELIGIBLE_MESSAGE]);
    error.mockRestore();
  });

  it('невозможное состояние (сессия без month) — ничего не делает', async () => {
    const { handler, attachScreenshot } = buildHandler({ userId: 'u1' });
    const { ctx, replies } = fakeCtx({ photo: true });

    await handler.handle(ctx, 111, { kind: 'payment' }, NOW);

    expect(attachScreenshot).not.toHaveBeenCalled();
    expect(replies).toEqual([]);
  });
});
