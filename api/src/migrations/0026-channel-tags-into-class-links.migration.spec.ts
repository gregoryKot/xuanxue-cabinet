// Теги канала → галочки занятий — против настоящей Mongo: правило — запросы к
// двум коллекциям, мок модели пропустил бы ошибку в самом фильтре. Документы
// пишем драйвером напрямую (образец: 0025): миграция обязана работать на данных,
// которые лежат на проде до деплоя, а у схемы поля `tags` у канала уже нет.
import { Types, type Connection } from 'mongoose';
import { channelTagsIntoClassLinks } from './0026-channel-tags-into-class-links.migration';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';

const CHANNELS = 'channels';
const CLASSES = 'classes';

describe('Миграция 0026-channel-tags-into-class-links', () => {
  let memory: MemoryMongo;
  let connection: Connection;

  function db(): NonNullable<Connection['db']> {
    if (!connection.db) throw new Error('тестовое соединение с БД ещё не готово');
    return connection.db;
  }

  async function createChannel(tags?: string[]): Promise<Types.ObjectId> {
    const _id = new Types.ObjectId();
    await db()
      .collection(CHANNELS)
      .insertOne({ _id, title: 'Канал', ...(tags ? { tags } : {}) });
    return _id;
  }

  async function createClass(
    channelIds: Types.ObjectId[],
    tags?: string[],
  ): Promise<Types.ObjectId> {
    const _id = new Types.ObjectId();
    await db()
      .collection(CLASSES)
      .insertOne({ _id, title: 'Занятие', channelIds, ...(tags ? { tags } : {}) });
    return _id;
  }

  async function channelIdsOf(classId: Types.ObjectId): Promise<string[]> {
    const doc = await db().collection(CLASSES).findOne({ _id: classId });
    return ((doc?.channelIds ?? []) as Types.ObjectId[]).map(String);
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

  it('занятие с тем же тегом сохраняет галочку, с чужим тегом и без тегов — теряет', async () => {
    const channel = await createChannel(['новички']);
    const matching = await createClass([channel], ['новички', 'вечер']);
    const foreign = await createClass([channel], ['средние']);
    const untagged = await createClass([channel]);

    await channelTagsIntoClassLinks.up(db());

    expect(await channelIdsOf(matching)).toEqual([channel.toString()]);
    expect(await channelIdsOf(foreign)).toEqual([]);
    expect(await channelIdsOf(untagged)).toEqual([]);
  });

  it('теги сравниваются без учёта регистра', async () => {
    const channel = await createChannel(['Новички']);
    const cls = await createClass([channel], ['НОВИЧКИ']);

    await channelTagsIntoClassLinks.up(db());

    expect(await channelIdsOf(cls)).toEqual([channel.toString()]);
  });

  it('другие каналы занятия остаются, снимается только отфильтрованный', async () => {
    const strict = await createChannel(['средние']);
    const open = await createChannel();
    const cls = await createClass([strict, open], ['новички']);

    await channelTagsIntoClassLinks.up(db());

    expect(await channelIdsOf(cls)).toEqual([open.toString()]);
  });

  it('канал без тегов и занятие без этого канала не трогаются', async () => {
    const open = await createChannel();
    const strict = await createChannel(['средние']);
    const linkedToOpen = await createClass([open]);
    const unlinked = await createClass([], ['новички']);
    await createClass([strict], ['средние']);

    await channelTagsIntoClassLinks.up(db());

    expect(await channelIdsOf(linkedToOpen)).toEqual([open.toString()]);
    expect(await channelIdsOf(unlinked)).toEqual([]);
  });

  it('поле tags убрано у всех каналов, в том числе у пустого массива', async () => {
    await createChannel(['новички']);
    await createChannel([]);
    await createChannel();

    await channelTagsIntoClassLinks.up(db());

    const withTags = await db()
      .collection(CHANNELS)
      .countDocuments({ tags: { $exists: true } });
    expect(withTags).toBe(0);
  });

  it('отчёт: по каналу — число снятых галочек, только id, без названий', async () => {
    const channel = await createChannel(['новички']);
    await createClass([channel], ['средние']);
    await createClass([channel], ['новичок']);
    await createClass([channel], ['новички']);

    const report = await channelTagsIntoClassLinks.up(db());

    expect(report).toEqual([`канал ${channel.toString()}: снято галочек у занятий — 2`]);
  });

  it('второй запуск ничего не меняет и ничего не сообщает', async () => {
    const channel = await createChannel(['новички']);
    const cls = await createClass([channel], ['средние']);
    const kept = await createClass([channel], ['новички']);
    await channelTagsIntoClassLinks.up(db());
    const before = await db().collection(CLASSES).find({}).toArray();

    const report = await channelTagsIntoClassLinks.up(db());

    expect(report).toEqual([]);
    expect(await db().collection(CLASSES).find({}).toArray()).toEqual(before);
    expect(await channelIdsOf(cls)).toEqual([]);
    expect(await channelIdsOf(kept)).toEqual([channel.toString()]);
  });
});
