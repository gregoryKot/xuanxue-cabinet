// Юнит с фейковым ctx и фейками сервисов (CLAUDE.md «Тесты» — ветвление,
// не HTTP/Mongo): интеграционный путь через реальный /start — в
// start.handler.spec.ts (describe «join_<code>»), read-after-write через
// вебхук — в telegram-webhook.e2e-spec.ts.
import { DateTime } from 'luxon';
import type { Context } from 'telegraf';
import type { User } from 'telegraf/types';
import { INVITE_LINK_INVALID_MESSAGE, ACCESS_MESSAGE } from '@xuanxue/shared';
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

function buildDeps(options: {
  findByTelegramId?: () => Promise<UserLean | null>;
  createFromTelegram?: () => Promise<UserLean>;
  join?: () => Promise<UserLean>;
  isValid?: () => Promise<boolean>;
  publicUrl?: string;
}): JoinDeepLinkDeps {
  return {
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
    publicUrl: options.publicUrl,
  };
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

    await handleInviteDeepLink(
      ctx,
      FROM,
      CODE,
      NOW,
      buildDeps({
        findByTelegramId: () => Promise.resolve(null),
        createFromTelegram,
        join,
        isValid: () => Promise.resolve(true),
        publicUrl: 'https://xuanxue.su',
      }),
    );

    expect(createFromTelegram).toHaveBeenCalledWith({
      telegramId: 1,
      name: 'Игорь',
      roles: [],
      status: 'invited',
    });
    expect(join).toHaveBeenCalledWith(created, CODE, NOW);
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

  it('известный человек, верный код — успех, PUBLIC_URL в тексте', async () => {
    const { ctx, replies } = fakeCtx();

    await handleInviteDeepLink(
      ctx,
      FROM,
      CODE,
      NOW,
      buildDeps({ publicUrl: 'https://xuanxue.su' }),
    );

    expect(replies).toEqual([
      'Вы в кабинете школы Сюань-Сюэ. Расписание и ссылки на занятия — здесь: https://xuanxue.su',
    ]);
  });

  it('PUBLIC_URL не задан — тот же текст, без адреса в конце', async () => {
    const { ctx, replies } = fakeCtx();

    await handleInviteDeepLink(ctx, FROM, CODE, NOW, buildDeps({ publicUrl: undefined }));

    expect(replies).toEqual([
      'Вы в кабинете школы Сюань-Сюэ. Расписание и ссылки на занятия — здесь: ',
    ]);
  });

  it('известный человек, неверный код — INVITE_LINK_INVALID_MESSAGE', async () => {
    const { ctx, replies } = fakeCtx();
    const join = () => Promise.reject(new UnauthorizedError(INVITE_LINK_INVALID_MESSAGE));

    await handleInviteDeepLink(ctx, FROM, CODE, NOW, buildDeps({ join }));

    expect(replies).toEqual([INVITE_LINK_INVALID_MESSAGE]);
  });

  it('blocked — ACCESS_MESSAGE', async () => {
    const { ctx, replies } = fakeCtx();
    const join = () => Promise.reject(new ForbiddenError(ACCESS_MESSAGE));

    await handleInviteDeepLink(ctx, FROM, CODE, NOW, buildDeps({ join }));

    expect(replies).toEqual([ACCESS_MESSAGE]);
  });

  it('неожиданная ошибка join() — пробрасывается наружу, не проглатывается тихо', async () => {
    const { ctx } = fakeCtx();
    const join = () => Promise.reject(new Error('mongo down'));

    await expect(
      handleInviteDeepLink(ctx, FROM, CODE, NOW, buildDeps({ join })),
    ).rejects.toThrow('mongo down');
  });
});
