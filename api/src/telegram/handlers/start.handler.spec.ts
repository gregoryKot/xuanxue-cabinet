// Против настоящей Mongo (mongodb-memory-server — CLAUDE.md «Тесты»):
// findByTelegramId и upsertTelegramChat читают/пишут по-настоящему. ctx —
// фейковый объект с `.from` и `.reply` (маршрутизацию Telegraf проверяет
// telegram-bot.service.spec.ts).
import type { ConfigService } from '@nestjs/config';
import type { Connection, Model } from 'mongoose';
import type { Context } from 'telegraf';
import { ChannelConfigService } from '../../channels/channel-config.service';
import { ChannelRecord, ChannelSchema } from '../../channels/channel.schema';
import { ClassRecord, ClassSchema } from '../../classes/class.schema';
import { openMemoryMongo, type MemoryMongo } from '../../test-support/mongo-memory';
import { UserRecord, UserSchema } from '../../users/user.schema';
import { UsersService } from '../../users/users.service';
import { StartHandler } from './start.handler';

function fakeConfig(publicUrl: string | undefined): ConfigService {
  return { get: () => publicUrl } as unknown as ConfigService;
}

function fakeCtx(
  telegramId: number | undefined,
  chatType: 'private' | 'group' = 'private',
): {
  ctx: Context;
  replies: string[];
} {
  const replies: string[] = [];
  const ctx = {
    chat: { type: chatType },
    from: telegramId === undefined ? undefined : { id: telegramId },
    reply: (text: string) => {
      replies.push(text);
      return Promise.resolve();
    },
  } as unknown as Context;
  return { ctx, replies };
}

describe('StartHandler', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let userModel: Model<UserRecord>;
  let channelModel: Model<ChannelRecord>;
  let classModel: Model<ClassRecord>;
  let handler: StartHandler;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    userModel = connection.model<UserRecord>(UserRecord.name, UserSchema);
    channelModel = connection.model<ChannelRecord>(ChannelRecord.name, ChannelSchema);
    classModel = connection.model<ClassRecord>(ClassRecord.name, ClassSchema);
    await channelModel.syncIndexes();
    handler = new StartHandler(
      fakeConfig('http://localhost:3000'),
      new UsersService(userModel),
      new ChannelConfigService(channelModel, classModel),
    );
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  afterEach(async () => {
    await userModel.deleteMany({});
    await channelModel.deleteMany({});
    await classModel.deleteMany({});
  });

  it('учитель — личный чат становится каналом, ответ с текстом подключения', async () => {
    const teacher = await userModel.create({
      name: 'Мария',
      telegramId: 111,
      roles: ['teacher'],
    });

    const { ctx, replies } = fakeCtx(111);
    await handler.handle(ctx);

    const channel = await channelModel.findOne({ target: '111' }).lean();
    expect(channel?.active).toBe(true);
    expect(channel?.title).toBe(`Личные сообщения: ${teacher.name}`);
    expect(replies).toHaveLength(1);
    expect(replies[0]).toContain('Вы подключены');
  });

  it('админ — тоже получает личный канал', async () => {
    await userModel.create({ name: 'Дима', telegramId: 222, roles: ['admin'] });

    const { ctx } = fakeCtx(222);
    await handler.handle(ctx);

    expect(await channelModel.countDocuments({ target: '222' })).toBe(1);
  });

  it('чужой Telegram ID — отказ, канал не создан', async () => {
    const { ctx, replies } = fakeCtx(999);
    await handler.handle(ctx);

    expect(await channelModel.countDocuments({})).toBe(0);
    expect(replies).toHaveLength(1);
    expect(replies[0]).toContain('http://localhost:3000');
    expect(replies[0]).not.toContain('Вы подключены');
  });

  it('ученик (роль student, без teacher/admin) — отказ, без канала', async () => {
    await userModel.create({ name: 'Ученик', telegramId: 333, roles: ['student'] });

    const { ctx, replies } = fakeCtx(333);
    await handler.handle(ctx);

    expect(await channelModel.countDocuments({})).toBe(0);
    expect(replies[0]).toContain('Этот бот для учителя');
  });

  it('апдейт без from — ничего не делает, не падает', async () => {
    const { ctx, replies } = fakeCtx(undefined);
    await expect(handler.handle(ctx)).resolves.toBeUndefined();
    expect(replies).toHaveLength(0);
  });

  it('/start из группы — игнорируется, без ответа и без канала', async () => {
    const { ctx, replies } = fakeCtx(111, 'group');

    await handler.handle(ctx);

    expect(replies).toHaveLength(0);
    expect(await channelModel.countDocuments({})).toBe(0);
  });

  it('PUBLIC_URL не задан — отказ без падения, без «на сайте …»', async () => {
    const noUrlHandler = new StartHandler(
      fakeConfig(undefined),
      new UsersService(userModel),
      new ChannelConfigService(channelModel, classModel),
    );
    const { ctx, replies } = fakeCtx(888);

    await noUrlHandler.handle(ctx);

    expect(replies[0]).toBe('Этот бот для учителя школы Сюань-Сюэ.');
    expect(replies[0]).not.toContain('на сайте');
  });

  it('ошибка UsersService — логируется, не выбрасывается, ответа нет', async () => {
    const failingHandler = new StartHandler(
      fakeConfig('http://localhost:3000'),
      {
        findByTelegramId: jest.fn().mockRejectedValue(new Error('mongo down')),
      } as unknown as UsersService,
      new ChannelConfigService(channelModel, classModel),
    );
    const { ctx, replies } = fakeCtx(777);

    await expect(failingHandler.handle(ctx)).resolves.toBeUndefined();
    expect(replies).toHaveLength(0);
  });
});
