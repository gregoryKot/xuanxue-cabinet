// Юнит с фейковым ctx и фейками сервисов (CLAUDE.md «Тесты» — ветвление,
// не HTTP/Mongo): интеграционный путь через реальный /start — в
// start.handler.spec.ts (describe «join_<code>»), read-after-write через
// вебхук — в telegram-webhook-join.e2e-spec.ts.
import { DateTime } from 'luxon';
import type { Context } from 'telegraf';
import type { User } from 'telegraf/types';
import { ACCESS_MESSAGE, INVITE_LINK_INVALID_MESSAGE } from '@xuanxue/shared';
import type { InviteLinkService } from '../../users/invite-link.service';
import type { UserLean, UsersService } from '../../users/users.service';
import { handleInviteDeepLink, type JoinDeepLinkDeps } from './join-invite-deep-link';

const NOW = DateTime.fromISO('2026-09-15T10:00:00Z');
const CODE = 'a'.repeat(32);
const FROM: Pick<User, 'id' | 'first_name' | 'last_name'> = {
  id: 1,
  first_name: 'Игорь',
};
const EXISTING_ACTIVE: UserLean = {
  id: 'u1',
  name: 'Ученик',
  roles: [],
  tz: 'Asia/Jerusalem',
  status: 'active',
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

function buildDeps(options: {
  findByTelegramId?: () => Promise<UserLean | null>;
  createFromTelegram?: () => Promise<UserLean>;
  markJoinedViaInvite?: () => Promise<void>;
  isValid?: () => Promise<boolean>;
  publicUrl?: string;
}): JoinDeepLinkDeps {
  return {
    usersService: {
      findByTelegramId: options.findByTelegramId ?? (() => Promise.resolve(null)),
      createFromTelegram:
        options.createFromTelegram ??
        (() => Promise.reject(new Error('createFromTelegram не должен был вызываться'))),
      markJoinedViaInvite: options.markJoinedViaInvite ?? (() => Promise.resolve()),
    } as unknown as UsersService,
    inviteLinkService: {
      isValid: options.isValid ?? (() => Promise.resolve(true)),
    } as unknown as InviteLinkService,
    publicUrl: options.publicUrl,
  };
}

describe('handleInviteDeepLink', () => {
  // Смысл ссылки — новый ученик из канала сразу в школе (владелец,
  // уточнение 2026-09-15): валидный код заводит незнакомца тем же способом,
  // что и вход через виджет на сайте (TelegramAuthService.fullName), сразу
  // `active` — статуса «ждёт подтверждения» больше нет (ADR-0034).
  it('незнакомец + валидный код — создаётся active из Telegram-идентичности', async () => {
    const created: UserLean = { ...EXISTING_ACTIVE, id: 'new1' };
    const createFromTelegram = jest.fn().mockResolvedValue(created);
    const markJoinedViaInvite = jest.fn().mockResolvedValue(undefined);
    const { ctx, replies } = fakeCtx();

    await handleInviteDeepLink(
      ctx,
      FROM,
      CODE,
      NOW,
      buildDeps({
        findByTelegramId: () => Promise.resolve(null),
        createFromTelegram,
        markJoinedViaInvite,
        isValid: () => Promise.resolve(true),
        publicUrl: 'https://xuanxue.su',
      }),
    );

    expect(createFromTelegram).toHaveBeenCalledWith({
      telegramId: 1,
      name: 'Игорь',
      roles: [],
      status: 'active',
    });
    expect(markJoinedViaInvite).toHaveBeenCalledWith('new1', NOW);
    expect(replies).toEqual([
      'Вы в кабинете школы Сюань-Сюэ. Расписание и ссылки на занятия — здесь: https://xuanxue.su',
    ]);
  });

  it('незнакомец + невалидный код — INVITE_LINK_INVALID_MESSAGE, аккаунт не создаётся', async () => {
    const createFromTelegram = jest.fn();
    const { ctx, replies } = fakeCtx();

    await handleInviteDeepLink(
      ctx,
      FROM,
      CODE,
      NOW,
      buildDeps({
        findByTelegramId: () => Promise.resolve(null),
        createFromTelegram,
        isValid: () => Promise.resolve(false),
      }),
    );

    expect(replies).toEqual([INVITE_LINK_INVALID_MESSAGE]);
    expect(createFromTelegram).not.toHaveBeenCalled();
  });

  it('известный человек, уже active — код игнорируется, тот же успех, PUBLIC_URL в тексте', async () => {
    const { ctx, replies } = fakeCtx();

    await handleInviteDeepLink(
      ctx,
      FROM,
      CODE,
      NOW,
      buildDeps({
        findByTelegramId: () => Promise.resolve(EXISTING_ACTIVE),
        isValid: () => Promise.resolve(false),
        publicUrl: 'https://xuanxue.su',
      }),
    );

    expect(replies).toEqual([
      'Вы в кабинете школы Сюань-Сюэ. Расписание и ссылки на занятия — здесь: https://xuanxue.su',
    ]);
  });

  it('PUBLIC_URL не задан — тот же текст, без адреса в конце', async () => {
    const { ctx, replies } = fakeCtx();

    await handleInviteDeepLink(
      ctx,
      FROM,
      CODE,
      NOW,
      buildDeps({
        findByTelegramId: () => Promise.resolve(null),
        createFromTelegram: () => Promise.resolve({ ...EXISTING_ACTIVE, id: 'new2' }),
        publicUrl: undefined,
      }),
    );

    expect(replies).toEqual([
      'Вы в кабинете школы Сюань-Сюэ. Расписание и ссылки на занятия — здесь: ',
    ]);
  });

  it('известный человек, blocked — ACCESS_MESSAGE, код не проверяется', async () => {
    const { ctx, replies } = fakeCtx();
    const isValid = jest.fn();

    await handleInviteDeepLink(
      ctx,
      FROM,
      CODE,
      NOW,
      buildDeps({
        findByTelegramId: () =>
          Promise.resolve({ ...EXISTING_ACTIVE, status: 'blocked' }),
        isValid,
      }),
    );

    expect(replies).toEqual([ACCESS_MESSAGE]);
    expect(isValid).not.toHaveBeenCalled();
  });

  it('неожиданная ошибка createFromTelegram — пробрасывается наружу, не проглатывается тихо', async () => {
    const { ctx } = fakeCtx();

    await expect(
      handleInviteDeepLink(
        ctx,
        FROM,
        CODE,
        NOW,
        buildDeps({
          findByTelegramId: () => Promise.resolve(null),
          createFromTelegram: () => Promise.reject(new Error('mongo down')),
        }),
      ),
    ).rejects.toThrow('mongo down');
  });
});
