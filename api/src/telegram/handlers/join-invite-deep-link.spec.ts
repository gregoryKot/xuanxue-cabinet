// Юнит с фейковым ctx и фейковым LoginIdentityService (CLAUDE.md «Тесты» —
// ветвление, не HTTP/Mongo): интеграционный путь через реальный /start и
// настоящий LoginIdentityService — в start.handler.join.spec.ts,
// read-after-write через вебхук — в telegram-webhook-join.e2e-spec.ts и
// telegram-webhook-join-access.e2e-spec.ts.
import { DateTime } from 'luxon';
import type { Context } from 'telegraf';
import type { User } from 'telegraf/types';
import {
  ACCESS_MESSAGE,
  INVITE_LINK_INVALID_MESSAGE,
  NO_INVITE_LINK_MESSAGE,
} from '@xuanxue/shared';
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

function buildDeps(
  resolveTelegramUser: LoginIdentityService['resolveTelegramUser'],
  publicUrl?: string,
): JoinDeepLinkDeps {
  return {
    loginIdentity: { resolveTelegramUser } as unknown as LoginIdentityService,
    publicUrl,
  };
}

describe('handleInviteDeepLink', () => {
  // Ветвление — только по результату/ошибке LoginIdentityService.resolveTelegramUser()
  // (ADR-0035): хендлер сам не ищет и не заводит пользователя, поэтому один
  // и тот же сервис заводит бутстрап-админа и здесь, и на сайте.
  it('resolveTelegramUser вернул active — текст успеха с PUBLIC_URL', async () => {
    const resolveTelegramUser = jest.fn().mockResolvedValue(ACTIVE_USER);
    const { ctx, replies } = fakeCtx();

    await handleInviteDeepLink(
      ctx,
      FROM,
      CODE,
      NOW,
      buildDeps(resolveTelegramUser, 'https://xuanxue.su'),
    );

    expect(resolveTelegramUser).toHaveBeenCalledWith(1, 'Игорь', CODE, NOW);
    expect(replies).toEqual([
      'Вы в кабинете школы Сюань-Сюэ. Расписание и ссылки на занятия — здесь: https://xuanxue.su',
    ]);
  });

  it('PUBLIC_URL не задан — тот же текст, без адреса в конце', async () => {
    const resolveTelegramUser = jest.fn().mockResolvedValue(ACTIVE_USER);
    const { ctx, replies } = fakeCtx();

    await handleInviteDeepLink(
      ctx,
      FROM,
      CODE,
      NOW,
      buildDeps(resolveTelegramUser, undefined),
    );

    expect(replies).toEqual([
      'Вы в кабинете школы Сюань-Сюэ. Расписание и ссылки на занятия — здесь: ',
    ]);
  });

  it('resolveTelegramUser вернул blocked — ACCESS_MESSAGE', async () => {
    const resolveTelegramUser = jest
      .fn()
      .mockResolvedValue({ ...ACTIVE_USER, status: 'blocked' });
    const { ctx, replies } = fakeCtx();

    await handleInviteDeepLink(
      ctx,
      FROM,
      CODE,
      NOW,
      buildDeps(resolveTelegramUser, 'https://xuanxue.su'),
    );

    expect(replies).toEqual([ACCESS_MESSAGE]);
  });

  it('resolveTelegramUser бросил ForbiddenError — INVITE_LINK_INVALID_MESSAGE, не текст сервиса', async () => {
    const resolveTelegramUser = jest
      .fn()
      .mockRejectedValue(new ForbiddenError(NO_INVITE_LINK_MESSAGE));
    const { ctx, replies } = fakeCtx();

    await handleInviteDeepLink(ctx, FROM, CODE, NOW, buildDeps(resolveTelegramUser));

    expect(replies).toEqual([INVITE_LINK_INVALID_MESSAGE]);
  });

  it('произвольная ошибка resolveTelegramUser — пробрасывается наружу, не проглатывается тихо', async () => {
    const resolveTelegramUser = jest.fn().mockRejectedValue(new Error('mongo down'));
    const { ctx } = fakeCtx();

    await expect(
      handleInviteDeepLink(ctx, FROM, CODE, NOW, buildDeps(resolveTelegramUser)),
    ).rejects.toThrow('mongo down');
  });
});
