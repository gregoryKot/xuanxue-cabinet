// Против настоящей Mongo (CLAUDE.md «Тесты»): find по kind/lessonId — важно
// проверить сам запрос (частичный индекс, фильтр по kind), не мок find().
import { Types, type Model } from 'mongoose';
import { BroadcastRecord, BroadcastSchema } from '../broadcasts/broadcast.schema';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { findLinkBroadcastStatusByLessonId } from './lesson-broadcast-status';

describe('findLinkBroadcastStatusByLessonId', () => {
  let memory: MemoryMongo;
  let broadcastModel: Model<BroadcastRecord>;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    broadcastModel = memory.connection.model<BroadcastRecord>(
      BroadcastRecord.name,
      BroadcastSchema,
    );
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  afterEach(async () => {
    await broadcastModel.deleteMany({});
  });

  function seed(overrides: Partial<BroadcastRecord> & { lessonId: Types.ObjectId }) {
    return broadcastModel.create({
      kind: 'lesson_link',
      text: 'Ссылка на занятие',
      scheduledAt: new Date(),
      channelIds: [],
      status: 'scheduled',
      ...overrides,
    });
  }

  it('находит статус ссылки для нужного занятия', async () => {
    const lessonId = new Types.ObjectId();
    await seed({ lessonId, status: 'sent' });

    const statusByLessonId = await findLinkBroadcastStatusByLessonId(broadcastModel, [
      lessonId,
    ]);

    expect(statusByLessonId.get(lessonId.toString())).toBe('sent');
  });

  it('одним запросом на несколько занятий сразу — карта на все', async () => {
    const first = new Types.ObjectId();
    const second = new Types.ObjectId();
    await seed({ lessonId: first, status: 'scheduled' });
    await seed({ lessonId: second, status: 'failed' });

    const statusByLessonId = await findLinkBroadcastStatusByLessonId(broadcastModel, [
      first,
      second,
    ]);

    expect(statusByLessonId.get(first.toString())).toBe('scheduled');
    expect(statusByLessonId.get(second.toString())).toBe('failed');
  });

  it('рассылка другого вида (recording) в карту не попадает', async () => {
    const lessonId = new Types.ObjectId();
    await seed({
      lessonId,
      kind: 'recording',
      recordingKey: 'https://drive.example/rec',
      status: 'sent',
    });

    const statusByLessonId = await findLinkBroadcastStatusByLessonId(broadcastModel, [
      lessonId,
    ]);

    expect(statusByLessonId.has(lessonId.toString())).toBe(false);
  });

  it('занятие без рассылки — в карте нет ключа', async () => {
    const withoutBroadcast = new Types.ObjectId();

    const statusByLessonId = await findLinkBroadcastStatusByLessonId(broadcastModel, [
      withoutBroadcast,
    ]);

    expect(statusByLessonId.has(withoutBroadcast.toString())).toBe(false);
    expect(statusByLessonId.size).toBe(0);
  });
});
