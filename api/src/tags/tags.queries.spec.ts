// Против настоящей Mongo (mongodb-memory-server, не мок модели — CLAUDE.md
// «Тесты»): каждая функция — своя агрегация, мок пропустил бы ошибку в самом
// `$match`/`$unwind`/`$group`. `mergeTagSummaries` — чистая логика, юнит-тест
// без Mongo, тем же файлом рядом со своими агрегациями (как
// buildMaterialsFilter в materials.queries.spec.ts).
import { Types, type Connection, type Model } from 'mongoose';
import { ChannelRecord, ChannelSchema } from '../channels/channel.schema';
import { ExamItemRecord, ExamItemSchema } from '../exams/exam-item.schema';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import {
  countChannelsByTag,
  countExamItemsByTag,
  mergeTagSummaries,
} from './tags.queries';

describe('countChannelsByTag / countExamItemsByTag', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let channelModel: Model<ChannelRecord>;
  let examItemModel: Model<ExamItemRecord>;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    channelModel = connection.model<ChannelRecord>(ChannelRecord.name, ChannelSchema);
    examItemModel = connection.model<ExamItemRecord>(ExamItemRecord.name, ExamItemSchema);
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  afterEach(async () => {
    await Promise.all([channelModel.deleteMany({}), examItemModel.deleteMany({})]);
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

  function createExamItem(tags: string[]) {
    return examItemModel.create({ kind: 'text', prompt: 'Вопрос', tags });
  }

  it('пусто — пустая карта', async () => {
    await expect(countChannelsByTag(channelModel)).resolves.toEqual(new Map());
    await expect(countExamItemsByTag(examItemModel)).resolves.toEqual(new Map());
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

  it('тег вопроса экзамена считается', async () => {
    await createExamItem(['начинающие']);

    const result = await countExamItemsByTag(examItemModel);

    expect(result).toEqual(new Map([['начинающие', 1]]));
  });

  it('два вопроса с одним тегом — сумма, не два ключа', async () => {
    await createExamItem(['дракон']);
    await createExamItem(['дракон']);

    const result = await countExamItemsByTag(examItemModel);

    expect(result).toEqual(new Map([['дракон', 2]]));
  });
});

describe('mergeTagSummaries', () => {
  it('пусто — пустой список', () => {
    expect(mergeTagSummaries(new Map(), new Map(), new Map(), new Map())).toEqual([]);
  });

  it('тег встречается во всех четырёх источниках — каждый посчитан своим числом', () => {
    const result = mergeTagSummaries(
      new Map([['дракон', 1]]),
      new Map([['дракон', 2]]),
      new Map([['дракон', 3]]),
      new Map([['дракон', 4]]),
    );

    expect(result).toEqual([
      {
        tag: 'дракон',
        lessonCount: 1,
        materialCount: 2,
        channelCount: 3,
        examItemCount: 4,
      },
    ]);
  });

  it('сортировка по суммарной использованности по убыванию, не по алфавиту', () => {
    const result = mergeTagSummaries(
      new Map([['а-редкий', 1]]),
      new Map(),
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
      new Map(),
    );

    expect(result.map((row) => row.tag)).toEqual(['а', 'я']);
  });
});
