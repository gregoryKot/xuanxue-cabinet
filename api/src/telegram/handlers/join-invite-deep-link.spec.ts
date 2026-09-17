// Юнит с фейковым ctx и фейковым LoginIdentityService (CLAUDE.md «Тесты» —
// ветвление, не HTTP/Mongo): интеграционный путь через реальный /start и
// настоящий LoginIdentityService — в start.handler.join.spec.ts,
// read-after-write через вебхук — в telegram-webhook-join.e2e-spec.ts,
// telegram-webhook-join-access.e2e-spec.ts и telegram-webhook-join-chat.e2e-spec.ts.
//
// Баг с #131 (найден 2026-09-16, #163): вход по ссылке заводил человека в
// active, но личный чат не регистрировался — здесь проверяем, что
// channelConfig.upsert* зовётся ТЕМ ЖЕ welcomeConnectedUser, что и обычный
// /start, а не копией, и только после успеха.
import { DateTime } from 'luxon';
import type { Context } from 'telegraf';
import type { User } from 'telegraf/types';
import {
  ACCESS_MESSAGE,
  INVITE_LINK_INVALID_MESSAGE,
  NO_INVITE_LINK_MESSAGE,
} from '@xuanxue/shared';
import type { ChannelConfigService } from '../../channels/channel-config.service';
import { ForbiddenError } from '../../common/errors';
import type { LoginIdentityService } from '../../users/login-identity.service';
import type { UserLean } from '../../users/users.service';
import { handleInviteDeepLink, type JoinDeepLinkDeps } from './join-invite-deep-link';

const NOW = DateTime.fromISO('2026-09-15T10:00:00Z');
const CODE = 'a'.repeat(32);
const FROM: Pick<User, 'id' | 'first_name' | 'last_name'> = {
  id: 1,
  first_name: 'Игорь',
};
const ACTIVE_USER: UserLean = {
  id: 'u1',
  name: 'Игорь',
  roles: [],
  tz: 'Asia/Jerusalem',
  status: 'active',
};
const JOIN_SUCCESS_WITH_URL =
  'Вы в кабинете школы Сюань-Сюэ. Расписание и ссылки на занятия — здесь: https://xuanxue.su';

function fakeCtx(): { ctx: Context; replies: string[] } {
  const replies: string[] = [];
  const ctx = {
    reply: (text: string) => {
      replies.push(text);
      return Promise.resolve();
    },
  } as unknown as Context;
  return { ctx, replies };
}

// jest.Mock уже на объекте (не `as jest.Mock` на каждом `expect()`) — иначе
// eslint unbound-method ругается на метод, снятый с объекта в момент вызова.
interface BuiltDeps {
  deps: JoinDeepLinkDeps;
  upsertPersonalTelegramChat: jest.Mock;
  upsertTelegramChat: jest.Mock;
}

function buildDeps(
  resolveTelegramUser: LoginIdentityService['resolveTelegramUser'],
  publicUrl?: string,
): BuiltDeps {
  const upsertPersonalTelegramChat = jest.fn().mockResolvedValue({});
  const upsertTelegramChat = jest.fn().mockResolvedValue({});
  const deps: JoinDeepLinkDeps = {
    loginIdentity: { resolveTelegramUser } as unknown as LoginIdentityService,
    channelConfig: {
      upsertPersonalTelegramChat,
      upsertTelegramChat,
    } as unknown as ChannelConfigService,
    publicUrl,
  };
  return { deps, upsertPersonalTelegramChat, upsertTelegramChat };
}

describe('handleInviteDeepLink', () => {
  // Ветвление — только по результату/ошибке LoginIdentityService.resolveTelegramUser()
  // (ADR-0036): хендлер сам не ищет и не заводит пользователя, поэтому один
  // и тот же сервис заводит бутстрап-админа и здесь, и на сайте.
  it('resolveTelegramUser вернул active-ученика — успех с PUBLIC_URL, личный канал и меню ученика', async () => {
    const resolveTelegramUser = jest.fn().mockResolvedValue(ACTIVE_USER);
    const { ctx, replies } = fakeCtx();
    const { deps, upsertPersonalTelegramChat, upsertTelegramChat } = buildDeps(
      resolveTelegramUser,
      'https://xuanxue.su',
    );

    await handleInviteDeepLink(ctx, FROM, CODE, NOW, deps);

    expect(resolveTelegramUser).toHaveBeenCalledWith(1, 'Игорь', CODE, NOW);
    // Регрессия 2026-09-16 (#163): после успеха — тот же welcomeConnectedUser,
    // что и обычный /start (ADR-0027): личный канал ученику и его меню.
    expect(replies[0]).toBe(JOIN_SUCCESS_WITH_URL);
    expect(replies.at(-1)).toEqual(expect.stringContaining('Экзамены можно сдать'));
    expect(upsertPersonalTelegramChat).toHaveBeenCalledWith({
      chatId: '1',
      title: 'Личные сообщения: Игорь',
    });
    expect(upsertTelegramChat).not.toHaveBeenCalled();
  });

  it('PUBLIC_URL не задан — тот же текст успеха, без адреса в конце', async () => {
    const resolveTelegramUser = jest.fn().mockResolvedValue(ACTIVE_USER);
    const { ctx, replies } = fakeCtx();

    await handleInviteDeepLink(
      ctx,
      FROM,
      CODE,
      NOW,
      buildDeps(resolveTelegramUser, undefined).deps,
    );

    expect(replies[0]).toBe(
      'Вы в кабинете школы Сюань-Сюэ. Расписание и ссылки на занятия — здесь: ',
    );
  });

  // Штат (учитель/помощник/админ) по ссылке — тот же путь, что и обычный
  // /start для active штата: канал школы, не личный канал ученика
  // (welcomeConnectedUser различает по isStaffRole(user.roles)).
  it('resolveTelegramUser вернул человека штата — канал школы и меню штата', async () => {
    const staff: UserLean = {
      ...ACTIVE_USER,
      id: 'staff1',
      name: 'Мария',
      roles: ['teacher'],
    };
    const resolveTelegramUser = jest.fn().mockResolvedValue(staff);
    const { ctx, replies } = fakeCtx();
    const { deps, upsertPersonalTelegramChat, upsertTelegramChat } = buildDeps(
      resolveTelegramUser,
      'https://xuanxue.su',
    );

    await handleInviteDeepLink(ctx, FROM, CODE, NOW, deps);

    expect(replies[0]).toBe(JOIN_SUCCESS_WITH_URL);
    expect(replies[1]).toContain('Вы подключены');
    expect(upsertTelegramChat).toHaveBeenCalledWith({
      chatId: '1',
      title: 'Личные сообщения: Мария',
    });
    expect(upsertPersonalTelegramChat).not.toHaveBeenCalled();
  });

  it('resolveTelegramUser вернул blocked — ACCESS_MESSAGE, канал не заводится', async () => {
    const resolveTelegramUser = jest
      .fn()
      .mockResolvedValue({ ...ACTIVE_USER, status: 'blocked' });
    const { ctx, replies } = fakeCtx();
    const { deps, upsertPersonalTelegramChat, upsertTelegramChat } = buildDeps(
      resolveTelegramUser,
      'https://xuanxue.su',
    );

    await handleInviteDeepLink(ctx, FROM, CODE, NOW, deps);

    expect(replies).toEqual([ACCESS_MESSAGE]);
    expect(upsertPersonalTelegramChat).not.toHaveBeenCalled();
    expect(upsertTelegramChat).not.toHaveBeenCalled();
  });

  it('resolveTelegramUser бросил ForbiddenError — INVITE_LINK_INVALID_MESSAGE, канал не заводится', async () => {
    const resolveTelegramUser = jest
      .fn()
      .mockRejectedValue(new ForbiddenError(NO_INVITE_LINK_MESSAGE));
    const { ctx, replies } = fakeCtx();
    const { deps, upsertPersonalTelegramChat, upsertTelegramChat } =
      buildDeps(resolveTelegramUser);

    await handleInviteDeepLink(ctx, FROM, CODE, NOW, deps);

    expect(replies).toEqual([INVITE_LINK_INVALID_MESSAGE]);
    expect(upsertPersonalTelegramChat).not.toHaveBeenCalled();
    expect(upsertTelegramChat).not.toHaveBeenCalled();
  });

  it('произвольная ошибка resolveTelegramUser — пробрасывается наружу, канал не заводится', async () => {
    const resolveTelegramUser = jest.fn().mockRejectedValue(new Error('mongo down'));
    const { ctx } = fakeCtx();
    const { deps, upsertPersonalTelegramChat, upsertTelegramChat } =
      buildDeps(resolveTelegramUser);

    await expect(handleInviteDeepLink(ctx, FROM, CODE, NOW, deps)).rejects.toThrow(
      'mongo down',
    );
    expect(upsertPersonalTelegramChat).not.toHaveBeenCalled();
    expect(upsertTelegramChat).not.toHaveBeenCalled();
  });
});
