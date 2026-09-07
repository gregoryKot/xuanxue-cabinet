// Против настоящей Mongo (mongodb-memory-server, не мок модели — CLAUDE.md
// «Тесты»): шифрование config, target как производное, дубль (type, target),
// запрет удаления подключённого канала. upsertTelegramChat и readConfig —
// в channel-config.service.spec.ts (ChannelConfigService).
import { randomBytes } from 'crypto';
import { Types } from 'mongoose';
import type { ConfigService } from '@nestjs/config';
import type { Connection, Model } from 'mongoose';
import type { ChannelAdapter, SendResult } from './channel-adapter';
import { ChannelAdapterRegistry } from './channel-adapter.registry';
import { ChannelConfigService } from './channel-config.service';
import { ChannelRecord, ChannelSchema } from './channel.schema';
import { ChannelsService } from './channels.service';
import { ManualAdapter } from './manual.adapter';
import { ClassRecord, ClassSchema } from '../classes/class.schema';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';

// Литерал секрета в тесте — находка gitleaks, даже фейкового: тот же приём,
// что в create-app.ts (TEST_BOT_TOKEN).
const FAKE_BOT_TOKEN = `123456:${randomBytes(18).toString('hex').slice(0, 35)}`;

function fakeConfig(botToken?: string): ConfigService {
  return { get: () => botToken } as unknown as ConfigService;
}

// Настоящий ManualAdapter рядом с фейковым telegram — детерминирован и не
// ходит в сеть, дублировать его фейком незачем.
function registryWith(sendResult: SendResult): ChannelAdapterRegistry {
  const telegram: ChannelAdapter = {
    type: 'telegram',
    send: jest.fn().mockResolvedValue(sendResult),
  };
  return new ChannelAdapterRegistry([telegram, new ManualAdapter()]);
}

describe('ChannelsService', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let model: Model<ChannelRecord>;
  let classModel: Model<ClassRecord>;
  let channelConfig: ChannelConfigService;
  let service: ChannelsService;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    model = connection.model<ChannelRecord>(ChannelRecord.name, ChannelSchema);
    classModel = connection.model<ClassRecord>(ClassRecord.name, ClassSchema);
    // Уникальный индекс (type, target) строится в фоне — без явного ожидания
    // тест на дубль иногда бежал бы без него (мигающий тест, тот же урок,
    // что в users.service.spec.ts).
    await model.syncIndexes();
    channelConfig = new ChannelConfigService(model, classModel);
    service = new ChannelsService(
      model,
      classModel,
      fakeConfig(),
      registryWith({ status: 'manual' }),
      channelConfig,
    );
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  afterEach(async () => {
    await model.deleteMany({});
    await classModel.deleteMany({});
  });

  it('list: без фильтра — все каналы, отсортированы по алфавиту', async () => {
    await service.create({ type: 'manual', title: 'Boosty', config: {} });
    await service.create({ type: 'manual', title: 'Facebook', config: {} });

    const list = await service.list({});

    expect(list.map((c) => c.title)).toEqual(['Boosty', 'Facebook']);
  });

  it('list: active: false отдаёт только выключенные каналы', async () => {
    const active = await service.create({
      type: 'manual',
      title: 'Включённый',
      config: {},
    });
    await service.update(active.id, { active: false });
    await service.create({ type: 'manual', title: 'И так активный', config: {} });

    const list = await service.list({ active: false });

    expect(list.map((c) => c.title)).toEqual(['Включённый']);
  });

  it('list: лимит ограничивает количество результатов', async () => {
    await service.create({ type: 'manual', title: 'А', config: {} });
    await service.create({ type: 'manual', title: 'Б', config: {} });

    const list = await service.list({ limit: 1 });

    expect(list).toHaveLength(1);
  });

  it('create → getById: read-after-write, config в ответе нет', async () => {
    const created = await service.create({
      type: 'telegram',
      title: 'Основной канал',
      config: { chatId: '@school' },
    });

    expect(created.target).toBe('@school');
    expect(created).not.toHaveProperty('config');

    const found = await service.getById(created.id);
    expect(found).toEqual(created);
  });

  it('create: config зашифрован в сырой Mongo, не JSON и не открытый текст', async () => {
    const created = await service.create({
      type: 'vk',
      title: 'Беседа ВК',
      config: { token: 'секрет-вк', peerId: 7 },
    });

    const raw = await model.findById(created.id).lean();
    expect(raw?.config).toBeDefined();
    expect(raw?.config).not.toContain('секрет-вк');
    expect(() => {
      JSON.parse(raw?.config as string);
    }).toThrow();
    expect(raw?.target).toBe('7');
  });

  it('create: telegram с пустым chatId — InvalidInputError, ничего не создаётся', async () => {
    await expect(
      service.create({ type: 'telegram', title: 'x', config: { chatId: '' } }),
    ).rejects.toThrow('chatId');
    expect(await model.countDocuments({})).toBe(0);
  });

  it('create: manual с непустым config — InvalidInputError', async () => {
    await expect(
      service.create({ type: 'manual', title: 'Facebook', config: { chatId: '@x' } }),
    ).rejects.toThrow('config');
  });

  it('create: дубль (type, target) — ConflictError, второй документ не создаётся', async () => {
    await service.create({
      type: 'telegram',
      title: 'Первый',
      config: { chatId: '@dup' },
    });

    await expect(
      service.create({ type: 'telegram', title: 'Второй', config: { chatId: '@dup' } }),
    ).rejects.toThrow('уже подключён');
    expect(await model.countDocuments({ type: 'telegram', target: '@dup' })).toBe(1);
  });

  it('update: config целиком — target меняется вместе с ним', async () => {
    const created = await service.create({
      type: 'telegram',
      title: 'Канал',
      config: { chatId: '@old' },
    });

    const updated = await service.update(created.id, { config: { chatId: '@new' } });

    expect(updated.target).toBe('@new');
  });

  it('update: title/active без config — target не трогается', async () => {
    const created = await service.create({
      type: 'telegram',
      title: 'Канал',
      config: { chatId: '@school' },
    });

    const updated = await service.update(created.id, {
      title: 'Новое название',
      active: false,
    });

    expect(updated.title).toBe('Новое название');
    expect(updated.active).toBe(false);
    expect(updated.target).toBe('@school');
  });

  it('update: config на target другого существующего канала — ConflictError', async () => {
    await service.create({ type: 'telegram', title: 'A', config: { chatId: '@taken' } });
    const created = await service.create({
      type: 'telegram',
      title: 'B',
      config: { chatId: '@free' },
    });

    await expect(
      service.update(created.id, { config: { chatId: '@taken' } }),
    ).rejects.toThrow('уже подключён');
  });

  it('update: канал удалён между чтением типа и записью — NotFoundError, не 500', async () => {
    const created = await service.create({
      type: 'telegram',
      title: 'Канал',
      config: { chatId: '@ghost' },
    });
    await model.deleteOne({ _id: created.id });

    await expect(
      service.update(created.id, { config: { chatId: '@ghost-new' } }),
    ).rejects.toThrow('не найден');
  });

  it.each([
    ['getById', (id: string) => service.getById(id)],
    ['update', (id: string) => service.update(id, { title: 'x' })],
    ['remove', (id: string) => service.remove(id)],
  ])('%s: невалидный ObjectId — NotFoundError, не CastError', async (_label, call) => {
    await expect(call('не-валидный-id')).rejects.toThrow('не найден');
  });

  it('remove: свободный канал удаляется', async () => {
    const created = await service.create({
      type: 'manual',
      title: 'Facebook',
      config: {},
    });

    await service.remove(created.id);

    await expect(service.getById(created.id)).rejects.toThrow('не найден');
  });

  it('remove: удалён другим запросом до этого — NotFoundError (deletedCount 0)', async () => {
    const unknownId = new Types.ObjectId().toString();

    await expect(service.remove(unknownId)).rejects.toThrow('не найден');
  });

  it('remove: канал в classes.channelIds — ConflictError, канал остаётся', async () => {
    const created = await service.create({
      type: 'manual',
      title: 'Facebook',
      config: {},
    });
    await classModel.create({
      title: 'Тайцзицюань',
      format: 'online',
      channelIds: [created.id],
    });

    await expect(service.remove(created.id)).rejects.toThrow('Сначала отключите');
    await expect(service.getById(created.id)).resolves.toMatchObject({
      title: 'Facebook',
    });
  });

  it('test(): manual — { status: "manual" }', async () => {
    const created = await service.create({
      type: 'manual',
      title: 'Facebook',
      config: {},
    });

    await expect(service.test(created.id)).resolves.toEqual({ status: 'manual' });
  });

  it('test(): ошибка адаптера — error проходит scrub перед возвратом', async () => {
    const failingService = new ChannelsService(
      model,
      classModel,
      fakeConfig(FAKE_BOT_TOKEN),
      registryWith({
        status: 'failed',
        error: `https://api.telegram.org/bot${FAKE_BOT_TOKEN}/sendMessage упал`,
        retryable: false,
      }),
      channelConfig,
    );
    const created = await service.create({
      type: 'telegram',
      title: 'Канал',
      config: { chatId: '@school' },
    });

    const result = await failingService.test(created.id);

    expect(result.status).toBe('failed');
    expect(result.error).not.toContain(FAKE_BOT_TOKEN);
    expect(result.error).toContain('[секрет]');
  });
});
