// Связка «канал ↔ занятие» — то, без чего планировщик каждый тик отменяет
// рассылку и на проде не уходит ничего. Проверяем на реальной Mongo и через
// модели: миграция пишет сырым драйвером, а читает эти документы приложение.
import { Types, type Connection, type Model } from 'mongoose';
import { attachChannelsToClasses } from './0004-attach-channels-to-classes.migration';
import { seedSchoolClasses } from './0001-school-classes.migration';
import { ChannelRecord } from '../channels/channel.schema';
import { ClassRecord } from '../classes/class.schema';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';

const EXPECTED_CLASSES = 11;

describe('Миграция 0004-attach-channels-to-classes', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let classModel: Model<ClassRecord>;
  let channelModel: Model<ChannelRecord>;

  function db(): NonNullable<Connection['db']> {
    if (!connection.db) throw new Error('тестовое соединение с БД ещё не готово');
    return connection.db;
  }

  async function createChannel(overrides: Partial<ChannelRecord> = {}) {
    return channelModel.create({
      type: 'telegram',
      title: 'Группа школы',
      config: JSON.stringify({ chatId: '-100500' }),
      ...overrides,
    });
  }

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    classModel = connection.model<ClassRecord>(ClassRecord.name);
    channelModel = connection.model<ChannelRecord>(ChannelRecord.name);
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  beforeEach(async () => {
    await Promise.all([classModel.deleteMany({}), channelModel.deleteMany({})]);
  });

  it('подключает активный канал ко всем занятиям без каналов', async () => {
    const channel = await createChannel();
    await seedSchoolClasses.up(db());

    await attachChannelsToClasses.up(db());

    const classes = await classModel.find().lean();
    expect(classes).toHaveLength(EXPECTED_CLASSES);
    for (const cls of classes) {
      expect(cls.channelIds.map(String)).toEqual([channel._id.toString()]);
    }
  });

  // Учитель мог отключить лишние занятия от чата (ADR-0015) — непустой список
  // это его решение, и миграция в него не лезет.
  it('занятие с уже выбранными каналами не трогает', async () => {
    const own = new Types.ObjectId();
    await createChannel();
    await seedSchoolClasses.up(db());
    await classModel.updateOne(
      { title: 'Цигун для глаз' },
      { $set: { channelIds: [own] } },
    );

    await attachChannelsToClasses.up(db());

    const found = await classModel.findOne({ title: 'Цигун для глаз' }).lean();
    expect(found?.channelIds.map(String)).toEqual([own.toString()]);
  });

  it('выключенный канал не подключает', async () => {
    await createChannel({ active: false });
    await seedSchoolClasses.up(db());

    await attachChannelsToClasses.up(db());

    const classes = await classModel.find().lean();
    expect(classes.every((cls) => cls.channelIds.length === 0)).toBe(true);
  });

  it('каналов нет вовсе — молчит, а не падает', async () => {
    await seedSchoolClasses.up(db());

    await expect(attachChannelsToClasses.up(db())).resolves.toBeUndefined();

    const classes = await classModel.find().lean();
    expect(classes.every((cls) => cls.channelIds.length === 0)).toBe(true);
  });

  it('идемпотентна: второй прогон не задваивает канал', async () => {
    await createChannel();
    await seedSchoolClasses.up(db());

    await attachChannelsToClasses.up(db());
    await attachChannelsToClasses.up(db());

    const classes = await classModel.find().lean();
    expect(classes.every((cls) => cls.channelIds.length === 1)).toBe(true);
  });
});
