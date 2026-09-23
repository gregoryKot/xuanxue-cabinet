// Против настоящей Mongo (mongodb-memory-server, не мок модели — CLAUDE.md
// «Тесты»): каждая функция — своя агрегация, мок пропустил бы ошибку в самом
// `$match`/`$unwind`/`$group`. `mergeTagSummaries` — чистая логика, юнит-тест
// без Mongo, тем же файлом рядом со своими агрегациями (как
// buildMaterialsFilter в materials.queries.spec.ts).
import { Types, type Connection, type Model } from 'mongoose';
import { ChannelRecord, ChannelSchema } from '../channels/channel.schema';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { countChannelsByTag, mergeTagSummaries } from './tags.queries';

describe('countChannelsByTag', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let channelModel: Model<ChannelRecord>;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    channelModel = connection.model<ChannelRecord>(ChannelRecord.name, ChannelSchema);
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  afterEach(async () => {
    await channelModel.deleteMany({});
  });

  function createChannel(overrides: Partial<ChannelRecord> = {}) {
    return channelModel.create({
      type: 'telegram',
      title: 'Канал школы',
      config: '{}',
      target: new Types.ObjectId().toString(),
      active: true,
      ...overrides,
    });
  }

  it('пусто — пустая карта', async () => {
    await expect(countChannelsByTag(channelModel)).resolves.toEqual(new Map());
  });

  it('тег канала школы считается', async () => {
    await createChannel({ tags: ['дракон'] });

    const result = await countChannelsByTag(channelModel);

    expect(result).toEqual(new Map([['дракон', 1]]));
  });

  // ADR-0027: личный канал ученика — не канал школы, тот же фильтр, что
  // ChannelsService.list.
  it('личный канал ученика (broadcastEligible: false) в счёт не идёт', async () => {
    await createChannel({ tags: ['дракон'], broadcastEligible: false });

    const result = await countChannelsByTag(channelModel);

    expect(result).toEqual(new Map());
  });
});

describe('mergeTagSummaries', () => {
  it('пусто — пустой список', () => {
    expect(mergeTagSummaries(new Map(), new Map(), new Map())).toEqual([]);
  });

  it('тег встречается во всех трёх источниках — каждый посчитан своим числом', () => {
    const result = mergeTagSummaries(
      new Map([['дракон', 1]]),
      new Map([['дракон', 2]]),
      new Map([['дракон', 3]]),
    );

    expect(result).toEqual([
      {
        tag: 'дракон',
        lessonCount: 1,
        materialCount: 2,
        channelCount: 3,
      },
    ]);
  });

  it('сортировка по суммарной использованности по убыванию, не по алфавиту', () => {
    const result = mergeTagSummaries(
      new Map([['а-редкий', 1]]),
      new Map(),
      new Map([['я-частый', 5]]),
    );

    expect(result.map((row) => row.tag)).toEqual(['я-частый', 'а-редкий']);
  });

  it('равная сумма — по алфавиту (localeCompare, ru)', () => {
    const result = mergeTagSummaries(
      new Map([
        ['я', 1],
        ['а', 1],
      ]),
      new Map(),
      new Map(),
    );

    expect(result.map((row) => row.tag)).toEqual(['а', 'я']);
  });
});
