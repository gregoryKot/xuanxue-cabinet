// Фейковый BotUserAccessService и фейковый NotificationPrefsService, без
// Mongo (CLAUDE.md «Тесты», тот же приём, что exam-command.handler.spec.ts):
// BotUserAccessService.resolve уже проверен против настоящей Mongo в
// bot-user-access.service.spec.ts, NotificationPrefsService.get — в
// notification-prefs.service.spec.ts. Здесь — только маршрутизация
// unknown/denied/active (ADR-0065: доступна и ученику, не только штату) и
// то, что каждый получает своё меню.
import { DateTime } from 'luxon';
import type { Context } from 'telegraf';
import { ACCESS_MESSAGE, type NotificationKind } from '@xuanxue/shared';
import type { UserLean } from '../../users/users.service';
import type { NotificationPrefsService } from '../../notifications/notification-prefs.service';
import type { BotUserAccessService } from '../bot-user-access.service';
import { activeAccess, fakeBotUserAccess } from '../bot-user-access.service.test-support';
import { NotificationsCommandHandler } from './notifications-command.handler';

const NOW = DateTime.fromISO('2026-09-06T18:00:00Z', { zone: 'utc' });
const TEACHER: UserLean = {
  id: 'u1',
  name: 'Мария',
  roles: ['teacher'],
  status: 'active',
};
const STUDENT: UserLean = { id: 'u2', name: 'Ваня', roles: [], status: 'active' };

function fakePrefs(enabled: NotificationKind[]): {
  service: NotificationPrefsService;
  get: jest.Mock;
} {
  const get = jest.fn().mockResolvedValue({ enabled });
  return { service: { get } as unknown as NotificationPrefsService, get };
}

function fakeCtx(
  chatId: number | undefined,
  chatType: 'private' | 'group' = 'private',
): { ctx: Context; replies: string[] } {
  const replies: string[] = [];
  const ctx = {
    chat: chatId === undefined ? undefined : { id: chatId, type: chatType },
    reply: (text: string, extra?: { reply_markup?: { inline_keyboard: unknown } }) => {
      // extra игнорируется в assertions ниже — кнопки уже проверены в
      // notifications-menu.spec.ts, здесь важен только текст и сам факт ответа.
      void extra;
      return Promise.resolve(Boolean(replies.push(text)));
    },
  } as unknown as Context;
  return { ctx, replies };
}

describe('NotificationsCommandHandler', () => {
  it('учитель — меню из своих видов', async () => {
    const prefs = fakePrefs(['post_draft', 'recording_request', 'delivery_failed']);
    const handler = new NotificationsCommandHandler(
      fakeBotUserAccess(activeAccess(TEACHER)),
      prefs.service,
    );
    const { ctx, replies } = fakeCtx(111);

    await handler.handle(ctx, NOW);

    expect(replies).toHaveLength(1);
    expect(replies[0]).toContain('Черновик поста — включено');
  });

  it('ученик (без ролей, ADR-0065) — получает меню со своим единственным видом', async () => {
    const prefs = fakePrefs(['exam_result']);
    const handler = new NotificationsCommandHandler(
      fakeBotUserAccess(activeAccess(STUDENT)),
      prefs.service,
    );
    const { ctx, replies } = fakeCtx(222);

    await handler.handle(ctx, NOW);

    expect(replies).toHaveLength(1);
    expect(replies[0]).toContain('Результат экзамена — включено');
    expect(replies[0]).not.toContain('Черновик поста');
  });

  it('заблокированный — ACCESS_MESSAGE, настройки не читаются', async () => {
    const prefs = fakePrefs([]);
    const handler = new NotificationsCommandHandler(
      fakeBotUserAccess({ kind: 'denied', message: ACCESS_MESSAGE }),
      prefs.service,
    );
    const { ctx, replies } = fakeCtx(333);

    await handler.handle(ctx, NOW);

    expect(replies).toEqual([ACCESS_MESSAGE]);
    expect(prefs.get).not.toHaveBeenCalled();
  });

  it('незнакомец — бот молчит', async () => {
    const prefs = fakePrefs([]);
    const handler = new NotificationsCommandHandler(
      fakeBotUserAccess({ kind: 'unknown' }),
      prefs.service,
    );
    const { ctx, replies } = fakeCtx(444);

    await handler.handle(ctx, NOW);

    expect(replies).toEqual([]);
    expect(prefs.get).not.toHaveBeenCalled();
  });

  it('сообщение из группы — игнорируется', async () => {
    const prefs = fakePrefs([]);
    const handler = new NotificationsCommandHandler(
      fakeBotUserAccess(activeAccess(TEACHER)),
      prefs.service,
    );
    const { ctx, replies } = fakeCtx(111, 'group');

    await handler.handle(ctx, NOW);

    expect(replies).toEqual([]);
  });

  it('нет ctx.chat — тихо выходит, не падает', async () => {
    const prefs = fakePrefs([]);
    const handler = new NotificationsCommandHandler(
      fakeBotUserAccess(activeAccess(TEACHER)),
      prefs.service,
    );
    const { ctx, replies } = fakeCtx(undefined);

    await expect(handler.handle(ctx, NOW)).resolves.toBeUndefined();
    expect(replies).toEqual([]);
  });

  it('сбой при резолве доступа — бот молчит, апдейт не падает', async () => {
    const prefs = fakePrefs([]);
    const failingAccess = {
      resolve: jest.fn().mockRejectedValue(new Error('Mongo недоступна')),
    } as unknown as BotUserAccessService;
    const handler = new NotificationsCommandHandler(failingAccess, prefs.service);
    const { ctx, replies } = fakeCtx(555);

    await expect(handler.handle(ctx, NOW)).resolves.toBeUndefined();
    expect(replies).toEqual([]);
  });
});
