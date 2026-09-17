// Юнит с фейковым ctx и фейками сервисов (CLAUDE.md «Тесты» — ветвление,
// не HTTP/Mongo): интеграционный путь через реальный /start — в
// start.handler.spec.ts (describe «join_<code>»), read-after-write через
// вебхук — в telegram-webhook.e2e-spec.ts и telegram-webhook-join-chat.e2e-spec.ts.
//
// Баг с #131 (найден 2026-09-16): join() заводил человека в active, но
// личный чат не регистрировался — здесь проверяем, что channelConfig.upsert*
// зовётся ТЕМ ЖЕ welcomeConnectedUser, что и обычный /start, а не копией.
import { DateTime } from 'luxon';
import type { Context } from 'telegraf';
import type { User } from 'telegraf/types';
import { INVITE_LINK_INVALID_MESSAGE, ACCESS_MESSAGE } from '@xuanxue/shared';
import type { ChannelConfigService } from '../../channels/channel-config.service';
import { ForbiddenError, UnauthorizedError } from '../../common/errors';
import type { InviteLinkService } from '../../users/invite-link.service';
import type { JoinByInviteService } from '../../users/join-by-invite.service';
import type { UserLean, UsersService } from '../../users/users.service';
import { handleInviteDeepLink, type JoinDeepLinkDeps } from './join-invite-deep-link';

const NOW = DateTime.fromISO('2026-09-15T10:00:00Z');
const CODE = 'a'.repeat(32);
const FROM: Pick<User, 'id' | 'first_name' | 'last_name'> = {
  id: 1,
  first_name: 'Игорь',
};
const USER: UserLean = {
  id: 'u1',
  name: 'Ученик',
  roles: [],
  tz: 'Asia/Jerusalem',
  status: 'invited',
};

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

function buildDeps(options: {
  findByTelegramId?: () => Promise<UserLean | null>;
  createFromTelegram?: () => Promise<UserLean>;
  join?: () => Promise<UserLean>;
  isValid?: () => Promise<boolean>;
  publicUrl?: string;
}): BuiltDeps {
  const upsertPersonalTelegramChat = jest.fn().mockResolvedValue({});
  const upsertTelegramChat = jest.fn().mockResolvedValue({});
  const deps: JoinDeepLinkDeps = {
    usersService: {
      findByTelegramId: options.findByTelegramId ?? (() => Promise.resolve(USER)),
      createFromTelegram:
        options.createFromTelegram ??
        (() => Promise.reject(new Error('createFromTelegram не должен был вызываться'))),
    } as unknown as UsersService,
    joinByInviteService: {
      join: options.join ?? (() => Promise.resolve({ ...USER, status: 'active' })),
    } as unknown as JoinByInviteService,
    inviteLinkService: {
      isValid: options.isValid ?? (() => Promise.resolve(true)),
    } as unknown as InviteLinkService,
    channelConfig: {
      upsertPersonalTelegramChat,
      upsertTelegramChat,
    } as unknown as ChannelConfigService,
    publicUrl: options.publicUrl,
  };
  return { deps, upsertPersonalTelegramChat, upsertTelegramChat };
}

describe('handleInviteDeepLink', () => {
  // Смысл ссылки — новый ученик из канала сразу в школе (владелец,
  // уточнение 2026-09-15): валидный код заводит незнакомца тем же способом,
  // что и вход через виджет на сайте (TelegramAuthService.fullName), и
  // сразу ведёт его через join() в active — без второго /start.
  it('незнакомец + валидный код — создаётся invited из Telegram-идентичности и сразу join() до active', async () => {
    const created: UserLean = { ...USER, id: 'new1' };
    const createFromTelegram = jest.fn().mockResolvedValue(created);
    const join = jest.fn().mockResolvedValue({ ...created, status: 'active' });
    const { ctx, replies } = fakeCtx();
    const { deps, upsertPersonalTelegramChat, upsertTelegramChat } = buildDeps({
      findByTelegramId: () => Promise.resolve(null),
      createFromTelegram,
      join,
      isValid: () => Promise.resolve(true),
      publicUrl: 'https://xuanxue.su',
    });

    await handleInviteDeepLink(ctx, FROM, CODE, NOW, deps);

    expect(createFromTelegram).toHaveBeenCalledWith({
      telegramId: 1,
      name: 'Игорь',
      roles: [],
      status: 'invited',
    });
    expect(join).toHaveBeenCalledWith(created, CODE, NOW);
    // Регрессия 2026-09-16: после join() — тот же welcomeConnectedUser, что и
    // обычный /start (ADR-0027), не копия — личный канал ученику и его меню.
    expect(replies).toEqual([
      'Вы в кабинете школы Сюань-Сюэ. Расписание и ссылки на занятия — здесь: https://xuanxue.su',
      expect.stringContaining('Экзамены можно сдать'),
    ]);
    expect(upsertPersonalTelegramChat).toHaveBeenCalledWith({
      chatId: '1',
      title: 'Личные сообщения: Ученик',
    });
    expect(upsertTelegramChat).not.toHaveBeenCalled();
  });

  it('незнакомец + невалидный код — INVITE_LINK_INVALID_MESSAGE, аккаунт не создаётся', async () => {
    const createFromTelegram = jest.fn();
    const { ctx, replies } = fakeCtx();
    const { deps, upsertPersonalTelegramChat, upsertTelegramChat } = buildDeps({
      findByTelegramId: () => Promise.resolve(null),
      createFromTelegram,
      isValid: () => Promise.resolve(false),
    });

    await handleInviteDeepLink(ctx, FROM, CODE, NOW, deps);

    expect(replies).toEqual([INVITE_LINK_INVALID_MESSAGE]);
    expect(createFromTelegram).not.toHaveBeenCalled();
    expect(upsertPersonalTelegramChat).not.toHaveBeenCalled();
    expect(upsertTelegramChat).not.toHaveBeenCalled();
  });

  it('известный человек, верный код — успех, PUBLIC_URL в тексте', async () => {
    const { ctx, replies } = fakeCtx();

    await handleInviteDeepLink(
      ctx,
      FROM,
      CODE,
      NOW,
      buildDeps({ publicUrl: 'https://xuanxue.su' }).deps,
    );

    expect(replies).toEqual([
      'Вы в кабинете школы Сюань-Сюэ. Расписание и ссылки на занятия — здесь: https://xuanxue.su',
      expect.stringContaining('Экзамены можно сдать'),
    ]);
  });

  it('PUBLIC_URL не задан — тот же текст, без адреса в конце', async () => {
    const { ctx, replies } = fakeCtx();

    await handleInviteDeepLink(
      ctx,
      FROM,
      CODE,
      NOW,
      buildDeps({ publicUrl: undefined }).deps,
    );

    expect(replies).toEqual([
      'Вы в кабинете школы Сюань-Сюэ. Расписание и ссылки на занятия — здесь: ',
      expect.stringContaining('Экзамены можно сдать'),
    ]);
  });

  it('известный человек, неверный код — INVITE_LINK_INVALID_MESSAGE', async () => {
    const { ctx, replies } = fakeCtx();
    const join = () => Promise.reject(new UnauthorizedError(INVITE_LINK_INVALID_MESSAGE));
    const { deps, upsertPersonalTelegramChat, upsertTelegramChat } = buildDeps({ join });

    await handleInviteDeepLink(ctx, FROM, CODE, NOW, deps);

    expect(replies).toEqual([INVITE_LINK_INVALID_MESSAGE]);
    expect(upsertPersonalTelegramChat).not.toHaveBeenCalled();
    expect(upsertTelegramChat).not.toHaveBeenCalled();
  });

  it('blocked — ACCESS_MESSAGE', async () => {
    const { ctx, replies } = fakeCtx();
    const join = () => Promise.reject(new ForbiddenError(ACCESS_MESSAGE));
    const { deps, upsertPersonalTelegramChat, upsertTelegramChat } = buildDeps({ join });

    await handleInviteDeepLink(ctx, FROM, CODE, NOW, deps);

    expect(replies).toEqual([ACCESS_MESSAGE]);
    expect(upsertPersonalTelegramChat).not.toHaveBeenCalled();
    expect(upsertTelegramChat).not.toHaveBeenCalled();
  });

  it('неожиданная ошибка join() — пробрасывается наружу, не проглатывается тихо', async () => {
    const { ctx } = fakeCtx();
    const join = () => Promise.reject(new Error('mongo down'));
    const { deps, upsertPersonalTelegramChat, upsertTelegramChat } = buildDeps({ join });

    await expect(handleInviteDeepLink(ctx, FROM, CODE, NOW, deps)).rejects.toThrow(
      'mongo down',
    );

    expect(upsertPersonalTelegramChat).not.toHaveBeenCalled();
    expect(upsertTelegramChat).not.toHaveBeenCalled();
  });

  // Штат (учитель/помощник/админ) по ссылке — тот же путь, что и обычный
  // /start для active штата: канал школы (получает всё расписание), не
  // личный broadcastEligible:false канал ученика (welcomeConnectedUser
  // различает по isStaffRole(user.roles)).
  it('join() вернул человека штата — welcomeConnectedUser ведёт его как штат: канал школы и меню штата', async () => {
    const staffUser: UserLean = {
      ...USER,
      id: 'staff1',
      name: 'Мария',
      roles: ['teacher'],
    };
    const join = jest.fn().mockResolvedValue(staffUser);
    const { ctx, replies } = fakeCtx();
    const { deps, upsertPersonalTelegramChat, upsertTelegramChat } = buildDeps({
      join,
      publicUrl: 'https://xuanxue.su',
    });

    await handleInviteDeepLink(ctx, FROM, CODE, NOW, deps);

    expect(replies).toHaveLength(3);
    expect(replies[0]).toBe(
      'Вы в кабинете школы Сюань-Сюэ. Расписание и ссылки на занятия — здесь: https://xuanxue.su',
    );
    expect(replies[1]).toContain('Вы подключены');
    expect(upsertTelegramChat).toHaveBeenCalledWith({
      chatId: '1',
      title: 'Личные сообщения: Мария',
    });
    expect(upsertPersonalTelegramChat).not.toHaveBeenCalled();
  });
});
