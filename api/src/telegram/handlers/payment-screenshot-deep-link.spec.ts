// Юнит с фейковым ctx, фейковым BotSessionService/BotUserAccessService/
// SettingsService (CLAUDE.md «Тесты» — ветвление, не HTTP/Mongo), тем же
// приёмом, что telegram-link-deep-link.spec.ts.
import { DateTime } from 'luxon';
import type { Context } from 'telegraf';
import type { SettingsService } from '../../settings/settings.service';
import type { BotSessionService } from '../bot-session.service';
import type { BotUserAccess, BotUserAccessService } from '../bot-user-access.service';
import {
  handlePaymentScreenshotDeepLink,
  PAYMENT_TELEGRAM_NOT_LINKED_MESSAGE,
  type PaymentScreenshotDeepLinkDeps,
} from './payment-screenshot-deep-link';

const NOW = DateTime.fromISO('2026-09-15T10:00:00Z', { zone: 'utc' });
const TELEGRAM_ID = 555;

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

function fakeDeps(access: BotUserAccess): {
  deps: PaymentScreenshotDeepLinkDeps;
  startPaymentWait: jest.Mock;
} {
  const startPaymentWait = jest.fn().mockResolvedValue(undefined);
  return {
    deps: {
      botSessions: { startPaymentWait } as unknown as BotSessionService,
      botAccess: {
        resolve: () => Promise.resolve(access),
      } as unknown as BotUserAccessService,
      settingsService: {
        get: () => Promise.resolve({ tz: 'Asia/Jerusalem' }),
      } as unknown as SettingsService,
    },
    startPaymentWait,
  };
}

describe('handlePaymentScreenshotDeepLink', () => {
  it('denied (заблокированный) — готовый отказ, ожидание не заводится', async () => {
    const { ctx, replies } = fakeCtx();
    const { deps, startPaymentWait } = fakeDeps({
      kind: 'denied',
      message: 'Доступ закрыт',
    });

    await handlePaymentScreenshotDeepLink(ctx, TELEGRAM_ID, '2026-09', NOW, deps);

    expect(replies).toEqual(['Доступ закрыт']);
    expect(startPaymentWait).not.toHaveBeenCalled();
  });

  it('unknown (Telegram не связан с кабинетом) — отказ до ожидания (RUNBOOK §8.17)', async () => {
    const { ctx, replies } = fakeCtx();
    const { deps, startPaymentWait } = fakeDeps({ kind: 'unknown' });

    await handlePaymentScreenshotDeepLink(ctx, TELEGRAM_ID, '2026-09', NOW, deps);

    expect(replies).toEqual([PAYMENT_TELEGRAM_NOT_LINKED_MESSAGE]);
    expect(startPaymentWait).not.toHaveBeenCalled();
  });

  it('active, месяц вне окна — отказ с названием месяца, ожидание не заводится', async () => {
    const { ctx, replies } = fakeCtx();
    const { deps, startPaymentWait } = fakeDeps({
      kind: 'active',
      user: {
        id: 'u1',
        name: 'Ученик',
        roles: [],
        status: 'active',
      },
    });

    await handlePaymentScreenshotDeepLink(ctx, TELEGRAM_ID, '2099-12', NOW, deps);

    expect(replies[0]).toContain('декабрь 2099');
    expect(startPaymentWait).not.toHaveBeenCalled();
  });

  it('active, месяц в окне — заводит ожидание и называет месяц по-русски', async () => {
    const { ctx, replies } = fakeCtx();
    const { deps, startPaymentWait } = fakeDeps({
      kind: 'active',
      user: {
        id: 'u1',
        name: 'Ученик',
        roles: [],
        status: 'active',
      },
    });

    await handlePaymentScreenshotDeepLink(ctx, TELEGRAM_ID, '2026-09', NOW, deps);

    expect(startPaymentWait).toHaveBeenCalledWith(TELEGRAM_ID, '2026-09', NOW);
    expect(replies[0]).toContain('сентябрь 2026');
  });

  it('reply падает (бот заблокирован) — не выбрасывается наружу', async () => {
    const ctx = {
      reply: () => Promise.reject(new Error('бот заблокирован')),
    } as unknown as Context;
    const { deps } = fakeDeps({ kind: 'unknown' });

    await expect(
      handlePaymentScreenshotDeepLink(ctx, TELEGRAM_ID, '2026-09', NOW, deps),
    ).resolves.toBeUndefined();
  });
});
