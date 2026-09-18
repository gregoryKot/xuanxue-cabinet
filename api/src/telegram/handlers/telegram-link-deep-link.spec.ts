// Юнит с фейковым ctx, фейковым TelegramLinkService и фейковым
// ChannelConfigService (CLAUDE.md «Тесты» — ветвление, не HTTP/Mongo):
// read-after-write против настоящей Mongo — в telegram-link-deep-link.channel.spec.ts.
// Интеграционный путь через реальный /start — в start.handler.spec.ts, если
// лимит файла позволит, иначе здесь же покрывается вызов из StartHandler
// опосредованно через сам результат.
//
// Баг с #131 (тот же класс ошибки, что и у join_<code>, починен там в #163):
// успешная связка подключала telegramId, но канал в channels не заводился —
// ниже проверяется, что welcomeConnectedUser (и через него
// upsertTelegramChat/upsertPersonalTelegramChat) зовётся на каждый `linked`,
// роль решает только какой из двух методов. Заблокированному канал не
// заводится не проверкой здесь, а тем, что до `linked` он не доходит вовсе —
// статус решает TelegramLinkService (см. исход `blocked` ниже).
import { DateTime } from 'luxon';
import type { Context } from 'telegraf';
import {
  ACCESS_MESSAGE,
  TELEGRAM_LINK_CODE_INVALID_MESSAGE,
  TELEGRAM_LINK_OTHER_TELEGRAM_MESSAGE,
  TELEGRAM_LINK_TAKEN_MESSAGE,
} from '@xuanxue/shared';
import type { ChannelConfigService } from '../../channels/channel-config.service';
import type {
  TelegramLinkResult,
  TelegramLinkService,
} from '../../users/telegram-link.service';
import {
  handleTelegramLinkDeepLink,
  type TelegramLinkDeepLinkDeps,
} from './telegram-link-deep-link';

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

/** `linkByCode`/`upsertTelegramChat`/`upsertPersonalTelegramChat` отдаются
 * отдельными переменными, а не читаются потом со `deps.linkService.…`: у
 * оторванного от объекта метода eslint отбирает `this`
 * (`@typescript-eslint/unbound-method`), и проверять вызов надо на самом
 * моке. */
function fakeDeps(result: TelegramLinkResult): {
  deps: TelegramLinkDeepLinkDeps;
  linkByCode: jest.Mock;
  upsertTelegramChat: jest.Mock;
  upsertPersonalTelegramChat: jest.Mock;
} {
  const linkByCode = jest.fn().mockResolvedValue(result);
  const upsertTelegramChat = jest.fn().mockResolvedValue(undefined);
  const upsertPersonalTelegramChat = jest.fn().mockResolvedValue(undefined);
  return {
    deps: {
      linkService: { linkByCode } as unknown as TelegramLinkService,
      channelConfig: {
        upsertTelegramChat,
        upsertPersonalTelegramChat,
      } as unknown as ChannelConfigService,
    },
    linkByCode,
    upsertTelegramChat,
    upsertPersonalTelegramChat,
  };
}

describe('handleTelegramLinkDeepLink', () => {
  it('invalid — TELEGRAM_LINK_CODE_INVALID_MESSAGE, канал не подключается', async () => {
    const { ctx, replies } = fakeCtx();
    const { deps, linkByCode, upsertTelegramChat, upsertPersonalTelegramChat } = fakeDeps(
      { kind: 'invalid' },
    );

    await handleTelegramLinkDeepLink(ctx, CODE, TELEGRAM_ID, NOW, deps);

    expect(replies).toEqual([TELEGRAM_LINK_CODE_INVALID_MESSAGE]);
    expect(linkByCode).toHaveBeenCalledWith(CODE, TELEGRAM_ID, NOW);
    expect(upsertTelegramChat).not.toHaveBeenCalled();
    expect(upsertPersonalTelegramChat).not.toHaveBeenCalled();
  });

  it('taken — TELEGRAM_LINK_TAKEN_MESSAGE, канал не подключается', async () => {
    const { ctx, replies } = fakeCtx();
    const { deps, upsertTelegramChat, upsertPersonalTelegramChat } = fakeDeps({
      kind: 'taken',
    });

    await handleTelegramLinkDeepLink(ctx, CODE, TELEGRAM_ID, NOW, deps);

    expect(replies).toEqual([TELEGRAM_LINK_TAKEN_MESSAGE]);
    expect(upsertTelegramChat).not.toHaveBeenCalled();
    expect(upsertPersonalTelegramChat).not.toHaveBeenCalled();
  });

  it('other-telegram — TELEGRAM_LINK_OTHER_TELEGRAM_MESSAGE, канал не подключается', async () => {
    const { ctx, replies } = fakeCtx();
    const { deps, upsertTelegramChat, upsertPersonalTelegramChat } = fakeDeps({
      kind: 'other-telegram',
    });

    await handleTelegramLinkDeepLink(ctx, CODE, TELEGRAM_ID, NOW, deps);

    expect(replies).toEqual([TELEGRAM_LINK_OTHER_TELEGRAM_MESSAGE]);
    expect(upsertTelegramChat).not.toHaveBeenCalled();
    expect(upsertPersonalTelegramChat).not.toHaveBeenCalled();
  });

  it('linked — текст называет аккаунт по имени, защита от чужого кода', async () => {
    const { ctx, replies } = fakeCtx();
    const { deps } = fakeDeps({
      kind: 'linked',
      user: {
        id: 'u1',
        name: 'Ольга',
        roles: [],
        tz: 'Asia/Jerusalem',
        status: 'active',
      },
    });

    await handleTelegramLinkDeepLink(ctx, CODE, TELEGRAM_ID, NOW, deps);

    expect(replies[0]).toContain('«Ольга»');
    expect(replies[0]).toContain('Связывали не вы?');
  });

  it('linked + active, ученик (без ролей штата) — подключается личный канал (upsertPersonalTelegramChat, ADR-0027)', async () => {
    const { ctx } = fakeCtx();
    const { deps, upsertTelegramChat, upsertPersonalTelegramChat } = fakeDeps({
      kind: 'linked',
      user: {
        id: 'u1',
        name: 'Ольга',
        roles: [],
        tz: 'Asia/Jerusalem',
        status: 'active',
      },
    });

    await handleTelegramLinkDeepLink(ctx, CODE, TELEGRAM_ID, NOW, deps);

    expect(upsertPersonalTelegramChat).toHaveBeenCalledWith({
      chatId: String(TELEGRAM_ID),
      title: 'Личные сообщения: Ольга',
    });
    expect(upsertTelegramChat).not.toHaveBeenCalled();
  });

  it('linked + active, штат (teacher) — подключается канал школы (upsertTelegramChat, ADR-0027)', async () => {
    const { ctx } = fakeCtx();
    const { deps, upsertTelegramChat, upsertPersonalTelegramChat } = fakeDeps({
      kind: 'linked',
      user: {
        id: 'u2',
        name: 'Дима',
        roles: ['teacher'],
        tz: 'Asia/Jerusalem',
        status: 'active',
      },
    });

    await handleTelegramLinkDeepLink(ctx, CODE, TELEGRAM_ID, NOW, deps);

    expect(upsertTelegramChat).toHaveBeenCalledWith({
      chatId: String(TELEGRAM_ID),
      title: 'Личные сообщения: Дима',
    });
    expect(upsertPersonalTelegramChat).not.toHaveBeenCalled();
  });

  it('blocked — ACCESS_MESSAGE без имени аккаунта, канал не подключается (SECURITY §2: за что заблокирован — не объясняем, а код могли подсунуть постороннему)', async () => {
    const { ctx, replies } = fakeCtx();
    const { deps, upsertTelegramChat, upsertPersonalTelegramChat } = fakeDeps({
      kind: 'blocked',
    });

    await handleTelegramLinkDeepLink(ctx, CODE, TELEGRAM_ID, NOW, deps);

    expect(replies).toEqual([ACCESS_MESSAGE]);
    expect(upsertTelegramChat).not.toHaveBeenCalled();
    expect(upsertPersonalTelegramChat).not.toHaveBeenCalled();
  });

  it('reply падает (бот заблокирован) — не выбрасывается наружу', async () => {
    const ctx = {
      reply: () => Promise.reject(new Error('бот заблокирован')),
    } as unknown as Context;
    const { deps } = fakeDeps({ kind: 'invalid' });

    await expect(
      handleTelegramLinkDeepLink(ctx, CODE, TELEGRAM_ID, NOW, deps),
    ).resolves.toBeUndefined();
  });
});
