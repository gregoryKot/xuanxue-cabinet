// Read-after-write против настоящей Mongo (mongodb-memory-server, CLAUDE.md
// «Тесты»: «сохранил → нашёл»), тот же приём, что у
// start.handler.join.spec.ts для ветки join_<code>: настоящий
// ChannelConfigService(channelModel, classModel), не мок — мок пропустил бы
// ошибку в самом upsert. Фейковый только TelegramLinkService — от него нужен
// один размеченный результат, а не связка кода с аккаунтом (это уже покрыто
// telegram-link.service.spec.ts).
//
// Регрессия «баг с #131» (тот же класс ошибки для ветки join_<code>, починен
// там в #163): успешная связка по link_<code> ставила telegramId на аккаунт,
// но записи в channels не появлялось — PersonalChats.chatFor/hasActiveChatFor
// (personal-chats.ts) без неё человека не находят, и уведомление боту не
// уходит ни при каких условиях.
import { DateTime } from 'luxon';
import type { Connection, Model } from 'mongoose';
import type { Context } from 'telegraf';
import { ChannelConfigService } from '../../channels/channel-config.service';
import { ChannelRecord, ChannelSchema } from '../../channels/channel.schema';
import { ClassRecord, ClassSchema } from '../../classes/class.schema';
import { openMemoryMongo, type MemoryMongo } from '../../test-support/mongo-memory';
import type { TelegramLinkService } from '../../users/telegram-link.service';
import { handleTelegramLinkDeepLink } from './telegram-link-deep-link';

const NOW = DateTime.fromISO('2026-09-17T10:00:00Z');
const CODE = 'a'.repeat(32);
const TELEGRAM_ID = 777;

function fakeCtx(): Context {
  return { reply: () => Promise.resolve() } as unknown as Context;
}

/** Единственный исход, который здесь нужен, — `linked`: сама связка кода с
 * аккаунтом (invalid/taken/other-telegram) уже покрыта
 * telegram-link.service.spec.ts и юнитом telegram-link-deep-link.spec.ts. */
function fakeLinkService(): TelegramLinkService {
  return {
    linkByCode: () =>
      Promise.resolve({
        kind: 'linked' as const,
        user: {
          id: 'u1',
          name: 'Ольга',
          roles: [],
          status: 'active' as const,
        },
      }),
  } as unknown as TelegramLinkService;
}

describe('handleTelegramLinkDeepLink — подключение канала (регрессия #131 для link_<code>)', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let channelModel: Model<ChannelRecord>;
  let classModel: Model<ClassRecord>;
  let channelConfig: ChannelConfigService;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    channelModel = connection.model<ChannelRecord>(ChannelRecord.name, ChannelSchema);
    classModel = connection.model<ClassRecord>(ClassRecord.name, ClassSchema);
    await channelModel.syncIndexes();
    channelConfig = new ChannelConfigService(channelModel, classModel);
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  afterEach(async () => {
    await channelModel.deleteMany({});
    await classModel.deleteMany({});
  });

  // Сценарий — ученик (без ролей штата): welcomeConnectedUser заводит личный
  // канал через upsertPersonalTelegramChat (ADR-0027), не канал школы.
  it('ученик, статус active — в channels находится активный личный Telegram-канал', async () => {
    await handleTelegramLinkDeepLink(fakeCtx(), CODE, TELEGRAM_ID, NOW, {
      linkService: fakeLinkService(),
      channelConfig,
    });

    const channel = await channelModel
      .findOne({ type: 'telegram', target: String(TELEGRAM_ID), active: true })
      .lean();

    expect(channel).not.toBeNull();
    // broadcastEligible: false — тот же инвариант, что и у join_<code>: личный
    // чат ученика не становится получателем рассылок школы (ADR-0027).
    expect(channel?.broadcastEligible).toBe(false);
    expect(channel?.title).toBe('Личные сообщения: Ольга');
  });
});
