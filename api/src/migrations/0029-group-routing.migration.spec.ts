// Один рычаг рассылки — группа (ADR-0195) — против настоящей Mongo. Данные
// кладём «старым кодом»: коллекциями напрямую, с `groupIds` и `channelIds`, как
// они лежат на проде до миграции; читаем потом моделями (read-after-write).
import { Types, type Connection, type Model } from 'mongoose';
import { ChannelRecord, ChannelSchema } from '../channels/channel.schema';
import { ClassRecord, ClassSchema } from '../classes/class.schema';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { groupRouting } from './0029-group-routing.migration';

describe('Миграция 0029-group-routing', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let classes: Model<ClassRecord>;
  let channels: Model<ChannelRecord>;
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

  async function legacyChannel(title: string, extra: Record<string, unknown> = {}) {
    const _id = new Types.ObjectId();
    await db()
      .collection('channels')
      .insertOne({
        _id,
        type: 'telegram',
        title,
        config: '{}',
        target: title,
        active: true,
        ...extra,
      });
    return _id;
  }

  /** Занятие как до ADR-0195: группы и каналы — массивы. */
  async function legacyClass(
    title: string,
    groupIds: Types.ObjectId[],
    channelIds: Types.ObjectId[],
  ) {
    await db().collection('classes').insertOne({
      title,
      groupLabel: 'старая подпись',
      format: 'online',
      rules: [],
      tz: 'Asia/Jerusalem',
      groupIds,
      channelIds,
      leadMinutes: 30,
      active: true,
    });
  }

  async function raw(title: string) {
    return db().collection('classes').findOne({ title });
  }

  it('занятие с одной группой получает её, подпись — название группы, groupIds снят', async () => {
    await legacyClass('А', [middle], []);

    await groupRouting.up(db());

    const dto = await classes.findOne({ title: 'А' }).lean();
    expect(dto?.groupId?.toString()).toBe(middle.toString());
    expect(dto?.forAllGroups).toBe(false);
    expect(dto?.groupLabel).toBe('Средние');
    expect(await raw('А')).not.toHaveProperty('groupIds');
  });

  it('занятие с двумя и больше группами — «для всех групп», groupId нет (пятничное «все группы»)', async () => {
    await legacyClass('Пятница', [beginners, middle, advanced], []);
    await legacyClass('Две', [beginners, middle], []);

    await groupRouting.up(db());

    for (const title of ['Пятница', 'Две']) {
      const doc = await classes.findOne({ title }).lean();
      expect(doc?.forAllGroups).toBe(true);
      expect(doc?.groupLabel).toBe('все группы');
      expect(await raw(title)).not.toHaveProperty('groupId');
      expect(await raw(title)).not.toHaveProperty('groupIds');
    }
  });

  it('занятие без групп остаётся без группы, не «для всех»', async () => {
    await legacyClass('Без', [], []);

    await groupRouting.up(db());

    const doc = await classes.findOne({ title: 'Без' }).lean();
    expect(doc?.groupId).toBeUndefined();
    expect(doc?.forAllGroups).toBe(false);
    expect(doc?.groupLabel).toBe('');
  });

  it('канал берёт группу занятий, где он отмечен, если она одна', async () => {
    const channel = await legacyChannel('Тайцзи вечер');
    await legacyClass('А', [beginners], [channel]);
    await legacyClass('Б', [beginners], [channel]);

    await groupRouting.up(db());

    const doc = await channels.findById(channel).lean();
    expect(doc?.groupId?.toString()).toBe(beginners.toString());
  });

  it('канал с занятиями разных групп или без занятий — без группы и в отчёте с id', async () => {
    const mixed = await legacyChannel('Смешанный');
    const lonely = await legacyChannel('Одинокий');
    await legacyClass('А', [beginners], [mixed]);
    await legacyClass('Б', [middle], [mixed]);

    const report = await groupRouting.up(db());

    for (const id of [mixed, lonely]) {
      expect((await channels.findById(id).lean())?.groupId).toBeUndefined();
    }
    const lines = report.filter((line) => line.startsWith('канал'));
    expect(lines).toHaveLength(2);
    expect(lines.join('\n')).toContain(String(mixed));
    expect(lines.join('\n')).toContain('групп: 2');
    expect(lines.join('\n')).toContain(String(lonely));
  });

  it('канал, отмеченный только у занятия «для всех групп», группы не получает — решает владелец', async () => {
    const channel = await legacyChannel('Для всех');
    await legacyClass('Пятница', [beginners, middle], [channel]);

    await groupRouting.up(db());

    expect((await channels.findById(channel).lean())?.groupId).toBeUndefined();
  });

  it('личный чат ученика группы не получает и в отчёт не попадает', async () => {
    const personal = await legacyChannel('Личный', { broadcastEligible: false });
    await legacyClass('А', [beginners], [personal]);

    const report = await groupRouting.up(db());

    expect((await channels.findById(personal).lean())?.groupId).toBeUndefined();
    expect(report.join('\n')).not.toContain(String(personal));
  });

  it('channelIds у занятия не снимается: старый код во время выката ещё читает его', async () => {
    const channel = await legacyChannel('Тайцзи вечер');
    await legacyClass('А', [beginners], [channel]);

    await groupRouting.up(db());

    expect((await raw('А'))?.channelIds).toEqual([channel]);
  });

  it('идемпотентна: второй прогон ничего не меняет, выбранное владельцем не затирает', async () => {
    const channel = await legacyChannel('Тайцзи вечер');
    await legacyClass('А', [beginners], [channel]);
    await legacyClass('Пятница', [beginners, middle], []);
    await groupRouting.up(db());
    // Владелец переназначил группу канала и занятия руками.
    await channels.updateOne({ _id: channel }, { $set: { groupId: advanced } });
    await classes.updateOne({ title: 'А' }, { $set: { groupId: middle } });

    const second = await groupRouting.up(db());

    expect((await channels.findById(channel).lean())?.groupId?.toString()).toBe(
      advanced.toString(),
    );
    expect((await classes.findOne({ title: 'А' }).lean())?.groupId?.toString()).toBe(
      middle.toString(),
    );
    expect((await classes.findOne({ title: 'Пятница' }).lean())?.forAllGroups).toBe(true);
    expect(second[0]).toBe('занятий переведено на группы: 0');
  });

  it('пустая база — отчёт без падения', async () => {
    await expect(groupRouting.up(db())).resolves.toEqual([
      'занятий переведено на группы: 0',
    ]);
  });
});
