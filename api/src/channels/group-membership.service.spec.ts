// Юнит-тест автоподтверждения по группе (ADR-0026) — фейковый клиент
// telegraf и фейковый ChannelConfigService, сеть не трогаем (CLAUDE.md
// «Тесты»). Приём fakeConfig/fakeClient — тот же, что telegram.adapter.spec.ts.
import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { ChannelConfigService } from './channel-config.service';
import { GroupMembershipService } from './group-membership.service';
import type { TelegramApiClient } from './telegram-client';

const BOT_TOKEN = '123456:fake-token-not-real';
const TELEGRAM_ID = 42;

type ChatResult = { type: string };
type MemberResult = { status: string };
type CallApiMock = jest.Mock<
  Promise<ChatResult | MemberResult>,
  [string, unknown, unknown]
>;

function fakeConfig(token: string | undefined): ConfigService {
  return { get: () => token } as unknown as ConfigService;
}

function fakeChannelConfig(chatIds: string[]): ChannelConfigService {
  return {
    listActiveTelegramChatIds: () => Promise.resolve(chatIds),
  } as unknown as ChannelConfigService;
}

// Без дефолта у token: аргумент undefined, переданный явно, и опущенный
// аргумент для параметра по умолчанию — одно и то же (сработал бы дефолт), а
// тест «нет BOT_TOKEN» как раз передаёт undefined явно (приём —
// telegram.adapter.spec.ts).
function serviceWith(
  callApi: CallApiMock,
  chatIds: string[],
  token: string | undefined,
): GroupMembershipService {
  const client = { callApi } as unknown as TelegramApiClient;
  return new GroupMembershipService(
    fakeConfig(token),
    fakeChannelConfig(chatIds),
    () => client,
  );
}

// Роутер по методу — как реальный Bot API: getChat и getChatMember зовутся
// разными аргументами, ответ зависит от chat_id.
function apiFor(
  chats: Record<string, ChatResult>,
  members: Record<string, MemberResult>,
): CallApiMock {
  return jest.fn((method: string, payload: unknown, _opts: unknown) => {
    const { chat_id: chatId } = payload as { chat_id: string };
    if (method === 'getChat') {
      const chat = chats[chatId];
      return chat ? Promise.resolve(chat) : Promise.reject(new Error('chat not found'));
    }
    const member = members[chatId];
    return member
      ? Promise.resolve(member)
      : Promise.reject(new Error('member not found'));
  }) as CallApiMock;
}

describe('GroupMembershipService.isMemberOfSchoolGroup', () => {
  afterEach(() => jest.restoreAllMocks());

  it('состоит в группе (status member) — true', async () => {
    const callApi = apiFor(
      { '@group': { type: 'group' } },
      { '@group': { status: 'member' } },
    );
    const service = serviceWith(callApi, ['@group'], BOT_TOKEN);

    await expect(service.isMemberOfSchoolGroup(TELEGRAM_ID)).resolves.toBe(true);
  });

  it.each(['left', 'kicked'])('status %s — не член, false', async (status) => {
    const callApi = apiFor(
      { '@group': { type: 'supergroup' } },
      { '@group': { status } },
    );
    const service = serviceWith(callApi, ['@group'], BOT_TOKEN);

    await expect(service.isMemberOfSchoolGroup(TELEGRAM_ID)).resolves.toBe(false);
  });

  it('личный чат (type private) — пропускается, getChatMember не зовётся', async () => {
    const callApi = apiFor({ '@teacher-dm': { type: 'private' } }, {});
    const service = serviceWith(callApi, ['@teacher-dm'], BOT_TOKEN);

    await expect(service.isMemberOfSchoolGroup(TELEGRAM_ID)).resolves.toBe(false);
    expect(callApi).not.toHaveBeenCalledWith(
      'getChatMember',
      expect.anything(),
      expect.anything(),
    );
  });

  it('широковещательный канал (type channel) — пропускается, getChatMember не зовётся', async () => {
    const callApi = apiFor({ '@broadcast': { type: 'channel' } }, {});
    const service = serviceWith(callApi, ['@broadcast'], BOT_TOKEN);

    await expect(service.isMemberOfSchoolGroup(TELEGRAM_ID)).resolves.toBe(false);
    expect(callApi).not.toHaveBeenCalledWith(
      'getChatMember',
      expect.anything(),
      expect.anything(),
    );
  });

  it('ошибка Bot API — false, warn в лог, вход не падает', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const callApi = jest
      .fn()
      .mockRejectedValue(new Error('403: bot is not in the chat')) as CallApiMock;
    const service = serviceWith(callApi, ['@group'], BOT_TOKEN);

    await expect(service.isMemberOfSchoolGroup(TELEGRAM_ID)).resolves.toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('нет BOT_TOKEN — false, каналы не опрашиваются', async () => {
    const callApi = jest.fn() as CallApiMock;
    const service = serviceWith(callApi, ['@group'], undefined);

    await expect(service.isMemberOfSchoolGroup(TELEGRAM_ID)).resolves.toBe(false);
    expect(callApi).not.toHaveBeenCalled();
  });

  it('несколько групп — останавливается на первой удачной, вторую не опрашивает', async () => {
    const callApi = apiFor(
      { '@first': { type: 'group' }, '@second': { type: 'group' } },
      { '@first': { status: 'member' }, '@second': { status: 'member' } },
    );
    const service = serviceWith(callApi, ['@first', '@second'], BOT_TOKEN);

    await expect(service.isMemberOfSchoolGroup(TELEGRAM_ID)).resolves.toBe(true);
    expect(callApi).not.toHaveBeenCalledWith(
      'getChat',
      { chat_id: '@second' },
      expect.anything(),
    );
  });
});
