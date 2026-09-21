// Против настоящей Mongo (mongodb-memory-server — CLAUDE.md «Тесты»): сама
// проверка уже покрыта channels/has-active-telegram-chat.spec.ts, здесь —
// только что сервис верно связывает свою модель с этой проверкой (мало
// веток, но метод ходит в базу — мок здесь пропустил бы ошибку в самом
// запросе).
import type { Model } from 'mongoose';
import { ChannelRecord, ChannelSchema } from '../channels/channel.schema';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { UserBotChatStatusService } from './user-bot-chat-status.service';
import type { UserLean } from './users.service';

const USER: UserLean = {
  id: 'u1',
  name: 'Ольга',
  roles: [],
  status: 'active',
  telegramId: 1301,
};

describe('UserBotChatStatusService.hasActiveChatFor', () => {
  let memory: MemoryMongo;
  let channelModel: Model<ChannelRecord>;
  let service: UserBotChatStatusService;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    channelModel = memory.connection.model<ChannelRecord>(
      ChannelRecord.name,
      ChannelSchema,
    );
    service = new UserBotChatStatusService(channelModel);
  }, 60_000);

  afterEach(async () => {
    await channelModel.deleteMany({});
  });

  afterAll(async () => {
    await memory.stop();
  });

  it('активный канал у этого telegramId — true', async () => {
    await channelModel.create({
      type: 'telegram',
      title: 'x',
      config: '{}',
      target: '1301',
      active: true,
    });

    await expect(service.hasActiveChatFor(USER)).resolves.toBe(true);
  });

  it('канала нет — false', async () => {
    await expect(service.hasActiveChatFor(USER)).resolves.toBe(false);
  });
});
