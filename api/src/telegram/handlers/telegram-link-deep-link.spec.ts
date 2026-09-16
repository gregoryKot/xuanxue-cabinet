// Юнит с фейковым ctx и фейковым TelegramLinkService (CLAUDE.md «Тесты» —
// ветвление, не HTTP/Mongo): интеграционный путь через реальный /start —
// в start.handler.spec.ts, если лимит файла позволит, иначе здесь же
// покрывается вызов из StartHandler опосредованно через сам результат.
import { DateTime } from 'luxon';
import type { Context } from 'telegraf';
import {
  TELEGRAM_LINK_CODE_INVALID_MESSAGE,
  TELEGRAM_LINK_OTHER_TELEGRAM_MESSAGE,
  TELEGRAM_LINK_TAKEN_MESSAGE,
} from '@xuanxue/shared';
import type {
  TelegramLinkResult,
  TelegramLinkService,
} from '../../users/telegram-link.service';
import { handleTelegramLinkDeepLink } from './telegram-link-deep-link';

const NOW = DateTime.fromISO('2026-09-16T10:00:00Z');
const CODE = 'a'.repeat(32);
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

/** `linkByCode` отдаётся отдельной переменной, а не читается потом со
 * `linkService.linkByCode`: у оторванного от объекта метода eslint отбирает
 * `this` (`@typescript-eslint/unbound-method`), и проверять вызов надо на
 * самом моке. */
function fakeLinkService(result: TelegramLinkResult): {
  linkService: TelegramLinkService;
  linkByCode: jest.Mock;
} {
  const linkByCode = jest.fn().mockResolvedValue(result);
  return { linkService: { linkByCode } as unknown as TelegramLinkService, linkByCode };
}

describe('handleTelegramLinkDeepLink', () => {
  it('invalid — TELEGRAM_LINK_CODE_INVALID_MESSAGE', async () => {
    const { ctx, replies } = fakeCtx();
    const { linkService, linkByCode } = fakeLinkService({ kind: 'invalid' });

    await handleTelegramLinkDeepLink(ctx, CODE, TELEGRAM_ID, NOW, linkService);

    expect(replies).toEqual([TELEGRAM_LINK_CODE_INVALID_MESSAGE]);
    expect(linkByCode).toHaveBeenCalledWith(CODE, TELEGRAM_ID, NOW);
  });

  it('taken — TELEGRAM_LINK_TAKEN_MESSAGE', async () => {
    const { ctx, replies } = fakeCtx();
    const { linkService } = fakeLinkService({ kind: 'taken' });

    await handleTelegramLinkDeepLink(ctx, CODE, TELEGRAM_ID, NOW, linkService);

    expect(replies).toEqual([TELEGRAM_LINK_TAKEN_MESSAGE]);
  });

  it('other-telegram — TELEGRAM_LINK_OTHER_TELEGRAM_MESSAGE', async () => {
    const { ctx, replies } = fakeCtx();
    const { linkService } = fakeLinkService({ kind: 'other-telegram' });

    await handleTelegramLinkDeepLink(ctx, CODE, TELEGRAM_ID, NOW, linkService);

    expect(replies).toEqual([TELEGRAM_LINK_OTHER_TELEGRAM_MESSAGE]);
  });

  it('linked — текст называет аккаунт по имени, защита от чужого кода', async () => {
    const { ctx, replies } = fakeCtx();
    const { linkService } = fakeLinkService({
      kind: 'linked',
      user: {
        id: 'u1',
        name: 'Ольга',
        roles: [],
        tz: 'Asia/Jerusalem',
        status: 'active',
      },
    });

    await handleTelegramLinkDeepLink(ctx, CODE, TELEGRAM_ID, NOW, linkService);

    expect(replies).toHaveLength(1);
    expect(replies[0]).toContain('«Ольга»');
    expect(replies[0]).toContain('Связывали не вы?');
  });

  it('reply падает (бот заблокирован) — не выбрасывается наружу', async () => {
    const ctx = {
      reply: () => Promise.reject(new Error('бот заблокирован')),
    } as unknown as Context;
    const { linkService } = fakeLinkService({ kind: 'invalid' });

    await expect(
      handleTelegramLinkDeepLink(ctx, CODE, TELEGRAM_ID, NOW, linkService),
    ).resolves.toBeUndefined();
  });
});
