// Против настоящей Mongo (mongodb-memory-server, не мок модели — CLAUDE.md
// «Тесты»): запрос по (type, target, active) должен реально пройти через
// индекс, не через угаданный мок. user — самодельный UserLean: функция не
// трогает UsersService, ей важны только telegramId/status (в отличие от
// PersonalChats.hasActiveChatFor, чей спек по-прежнему берёт настоящего
// пользователя — personal-chats.chat-for.spec.ts, поведение не изменилось).
import type { Model } from 'mongoose';
import type { UserLean } from '../users/users.service';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { ChannelRecord, ChannelSchema } from './channel.schema';
import { hasActiveTelegramChat } from './has-active-telegram-chat';

function user(overrides: Partial<UserLean> = {}): UserLean {
  return {
    id: 'u1',
    name: 'Ольга',
    roles: [],
    status: 'active',
    telegramId: 1201,
    ...overrides,
  };
}

describe('hasActiveTelegramChat', () => {
  let memory: MemoryMongo;
  let channelModel: Model<ChannelRecord>;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    channelModel = memory.connection.model<ChannelRecord>(
      ChannelRecord.name,
      ChannelSchema,
    );
  }, 60_000);

  afterEach(async () => {
    await channelModel.deleteMany({});
  });

  afterAll(async () => {
    await memory.stop();
  });

  it('активный канал telegram с этим target — true', async () => {
    await channelModel.create({
      type: 'telegram',
      title: 'x',
      config: '{}',
      target: '1201',
      active: true,
    });

    await expect(hasActiveTelegramChat(channelModel, user())).resolves.toBe(true);
  });

  it('канала нет — false', async () => {
    await expect(hasActiveTelegramChat(channelModel, user())).resolves.toBe(false);
  });

  it('канал есть, но выключен — false', async () => {
    await channelModel.create({
      type: 'telegram',
      title: 'x',
      config: '{}',
      target: '1201',
      active: false,
    });

    await expect(hasActiveTelegramChat(channelModel, user())).resolves.toBe(false);
  });

  it('telegramId не задан — false, в базу не ходим', async () => {
    await expect(
      hasActiveTelegramChat(channelModel, user({ telegramId: undefined })),
    ).resolves.toBe(false);
  });

  it('заблокирован — false, даже если канал активен (SECURITY §9)', async () => {
    await channelModel.create({
      type: 'telegram',
      title: 'x',
      config: '{}',
      target: '1201',
      active: true,
    });

    await expect(
      hasActiveTelegramChat(channelModel, user({ status: 'blocked' })),
    ).resolves.toBe(false);
  });

  it('user === null — false, не бросает', async () => {
    await expect(hasActiveTelegramChat(channelModel, null)).resolves.toBe(false);
  });
});
