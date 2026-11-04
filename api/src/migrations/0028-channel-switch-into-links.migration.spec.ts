// Выключатель канала → галочки занятий — против настоящей Mongo: правило —
// запросы к двум коллекциям. Документы пишем драйвером напрямую (образец: 0026):
// миграция работает на данных, которые лежат на проде до деплоя.
import { Types, type Connection } from 'mongoose';
import { channelSwitchIntoLinks } from './0028-channel-switch-into-links.migration';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';

const CHANNELS = 'channels';
const CLASSES = 'classes';

describe('Миграция 0028-channel-switch-into-links', () => {
  let memory: MemoryMongo;
  let connection: Connection;

  function db(): NonNullable<Connection['db']> {
    if (!connection.db) throw new Error('тестовое соединение с БД ещё не готово');
    return connection.db;
  }

  async function createChannel(fields: Record<string, unknown>): Promise<Types.ObjectId> {
    const _id = new Types.ObjectId();
    await db()
      .collection(CHANNELS)
      .insertOne({ _id, title: 'Канал', ...fields });
    return _id;
  }

  async function createClass(channelIds: Types.ObjectId[]): Promise<Types.ObjectId> {
    const _id = new Types.ObjectId();
    await db().collection(CLASSES).insertOne({ _id, title: 'Занятие', channelIds });
    return _id;
  }

  async function channelIdsOf(classId: Types.ObjectId): Promise<string[]> {
    const doc = await db().collection(CLASSES).findOne({ _id: classId });
    return ((doc?.channelIds ?? []) as Types.ObjectId[]).map(String);
  }

  async function activeOf(channelId: Types.ObjectId): Promise<boolean | undefined> {
    const doc = await db().collection(CHANNELS).findOne({ _id: channelId });
    return doc?.active as boolean | undefined;
  }

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  afterEach(async () => {
    await db().collection(CHANNELS).deleteMany({});
    await db().collection(CLASSES).deleteMany({});
  });

  it('выключенный канал школы: галочки сняты у всех занятий, канал включён, чужие галочки целы', async () => {
    const off = await createChannel({ active: false });
    const other = await createChannel({ active: true });
    const first = await createClass([off, other]);
    const second = await createClass([off]);

    const report = await channelSwitchIntoLinks.up(db());

    expect(await channelIdsOf(first)).toEqual([other.toString()]);
    expect(await channelIdsOf(second)).toEqual([]);
    expect(await activeOf(off)).toBe(true);
    expect(report).toHaveLength(1);
  });

  it('включённый канал не тронут: галочки на месте', async () => {
    const on = await createChannel({ active: true });
    const cls = await createClass([on]);

    const report = await channelSwitchIntoLinks.up(db());

    expect(await channelIdsOf(cls)).toEqual([on.toString()]);
    expect(await activeOf(on)).toBe(true);
    expect(report).toEqual([]);
  });

  it('личный чат ученика с active: false не тронут (там это «бот заблокирован»)', async () => {
    const personal = await createChannel({ active: false, broadcastEligible: false });

    await channelSwitchIntoLinks.up(db());

    expect(await activeOf(personal)).toBe(false);
  });

  it('второй запуск ничего не меняет', async () => {
    const off = await createChannel({ active: false });
    const cls = await createClass([off]);

    await channelSwitchIntoLinks.up(db());
    const second = await channelSwitchIntoLinks.up(db());

    expect(second).toEqual([]);
    expect(await channelIdsOf(cls)).toEqual([]);
    expect(await activeOf(off)).toBe(true);
  });
});
