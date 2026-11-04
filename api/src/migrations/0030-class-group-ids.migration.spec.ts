// Несколько групп у занятия и канала (ADR-0196) против настоящей Mongo. Данные
// кладём «старым кодом» — коллекциями напрямую, с `groupId`/`forAllGroups`, как
// они лежат после 0029; читаем потом моделями (read-after-write).
import { Types, type Connection, type Model } from 'mongoose';
import { ChannelRecord, ChannelSchema } from '../channels/channel.schema';
import { ClassRecord, ClassSchema } from '../classes/class.schema';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { classGroupIds } from './0030-class-group-ids.migration';

describe('Миграция 0030-class-group-ids', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let classes: Model<ClassRecord>;
  let channels: Model<ChannelRecord>;
  // Порядок _id — порядок создания групп.
  const beginners = new Types.ObjectId();
  const middle = new Types.ObjectId();
  const advanced = new Types.ObjectId();

  function db() {
    if (!connection.db) throw new Error('тестовое соединение с БД ещё не готово');
    return connection.db;
  }

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    classes = connection.model<ClassRecord>(ClassRecord.name, ClassSchema);
    channels = connection.model<ChannelRecord>(ChannelRecord.name, ChannelSchema);
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  beforeEach(async () => {
    await Promise.all([
      classes.deleteMany({}),
      channels.deleteMany({}),
      db().collection('groups').deleteMany({}),
    ]);
    await db()
      .collection('groups')
      .insertMany([
        { _id: beginners, name: 'Начинающие', nameKey: 'начинающие' },
        { _id: middle, name: 'Средние', nameKey: 'средние' },
        { _id: advanced, name: 'Старшие', nameKey: 'старшие' },
      ]);
  });

  async function legacyClass(title: string, extra: Record<string, unknown>) {
    await db()
      .collection('classes')
      .insertOne({
        title,
        groupLabel: 'старая подпись',
        format: 'online',
        rules: [],
        tz: 'Asia/Jerusalem',
        leadMinutes: 30,
        active: true,
        ...extra,
      });
  }

  async function raw(title: string) {
    return db().collection('classes').findOne({ title });
  }

  it('занятие с одной группой получает [группа] и подпись-название', async () => {
    await legacyClass('А', { groupId: middle, forAllGroups: false });

    await classGroupIds.up(db());

    const dto = await classes.findOne({ title: 'А' }).lean();
    expect(dto?.groupIds.map(String)).toEqual([middle.toString()]);
    expect(dto?.groupLabel).toBe('Средние');
    expect(await raw('А')).not.toHaveProperty('groupId');
    expect(await raw('А')).not.toHaveProperty('forAllGroups');
  });

  it('«для всех групп» становится всеми группами школы в порядке создания', async () => {
    await legacyClass('Пятница', { forAllGroups: true, groupLabel: 'все группы' });

    await classGroupIds.up(db());

    const dto = await classes.findOne({ title: 'Пятница' }).lean();
    expect(dto?.groupIds.map(String)).toEqual([
      beginners.toString(),
      middle.toString(),
      advanced.toString(),
    ]);
    expect(dto?.groupLabel).toBe('Начинающие, Средние, Старшие');
    expect(await raw('Пятница')).not.toHaveProperty('forAllGroups');
  });

  it('занятие без группы получает пустой список и пустую подпись', async () => {
    await legacyClass('Без', { forAllGroups: false });

    await classGroupIds.up(db());

    const dto = await classes.findOne({ title: 'Без' }).lean();
    expect(dto?.groupIds).toEqual([]);
    expect(dto?.groupLabel).toBe('');
  });

  it('канал: groupId → [groupId], без группы → [], groupId снят', async () => {
    const withGroup = new Types.ObjectId();
    const without = new Types.ObjectId();
    const base = { type: 'telegram', config: '{}', active: true };
    await db()
      .collection('channels')
      .insertMany([
        { _id: withGroup, title: 'С группой', target: 'a', groupId: advanced, ...base },
        { _id: without, title: 'Без', target: 'b', ...base },
      ]);

    await classGroupIds.up(db());

    expect((await channels.findById(withGroup).lean())?.groupIds.map(String)).toEqual([
      advanced.toString(),
    ]);
    expect((await channels.findById(without).lean())?.groupIds).toEqual([]);
    expect(
      await db().collection('channels').findOne({ _id: withGroup }),
    ).not.toHaveProperty('groupId');
  });

  it('идемпотентна: занятие и канал с groupIds повтор не трогает', async () => {
    await legacyClass('Уже', {
      groupIds: [middle, advanced],
      groupLabel: 'Средние, Старшие',
    });
    const channel = new Types.ObjectId();
    await db()
      .collection('channels')
      .insertOne({
        _id: channel,
        type: 'telegram',
        title: 'К',
        config: '{}',
        target: 'x',
        active: true,
        groupIds: [middle],
      });
    await legacyClass('Старое', { groupId: beginners });

    const first = await classGroupIds.up(db());
    const second = await classGroupIds.up(db());

    expect(first[0]).toContain('1');
    expect(second[0]).toContain('0');
    expect(
      (await classes.findOne({ title: 'Уже' }).lean())?.groupIds.map(String),
    ).toEqual([middle.toString(), advanced.toString()]);
    expect((await channels.findById(channel).lean())?.groupIds.map(String)).toEqual([
      middle.toString(),
    ]);
  });
});
