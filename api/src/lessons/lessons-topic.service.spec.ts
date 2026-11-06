// Против настоящей Mongo: запись темы в несколько занятий, расшифровка при
// чтении и «всё или ничего» при неизвестном id. Пересборку поста считает
// фейк — её механика проверена в lesson-link-rebuild.service.spec.ts.
import { DateTime } from 'luxon';
import { Types, type Connection, type Model } from 'mongoose';
import type { LessonLinkRebuildService } from '../broadcasts/lesson-link-rebuild.service';
import { NotFoundError } from '../common/errors';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { UserRecord, UserSchema } from '../users/user.schema';
import { LessonRecord, LessonSchema } from './lesson.schema';
import { findLessonDto } from './lessons.queries';
import { LessonsTopicService } from './lessons-topic.service';

const NOW = DateTime.fromISO('2026-09-03T12:00:00Z', { zone: 'utc' });

describe('LessonsTopicService', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let lessonModel: Model<LessonRecord>;
  const rebuilt: string[] = [];
  let service: LessonsTopicService;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    lessonModel = connection.model<LessonRecord>(LessonRecord.name, LessonSchema);
    const userModel = connection.model<UserRecord>(UserRecord.name, UserSchema);
    const rebuild = {
      rebuild: (id: Types.ObjectId): Promise<boolean> => {
        rebuilt.push(id.toString());
        return Promise.resolve(true);
      },
    } as unknown as LessonLinkRebuildService;
    service = new LessonsTopicService(lessonModel, userModel, rebuild);
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  afterEach(async () => {
    rebuilt.length = 0;
    await lessonModel.deleteMany({});
  });

  async function createLesson(topic = ''): Promise<string> {
    const doc = await lessonModel.create({
      classId: new Types.ObjectId(),
      startsAt: new Date('2026-09-04T16:00:00Z'),
      durationMin: 60,
      topic,
      status: 'scheduled',
    });
    return doc._id.toString();
  }

  async function topicOf(id: string): Promise<string | undefined> {
    return (await findLessonDto(lessonModel, id)).topic;
  }

  it('пишет тему в оба занятия и пересобирает пост у каждого', async () => {
    const a = await createLesson();
    const b = await createLesson('Старая');

    const result = await service.setTopic(
      { topic: 'Шаги назад', lessonIds: [a, b] },
      NOW,
    );

    expect(result.map((lesson) => lesson.topic)).toEqual(['Шаги назад', 'Шаги назад']);
    expect(await topicOf(a)).toBe('Шаги назад');
    expect(await topicOf(b)).toBe('Шаги назад');
    expect([...rebuilt].sort()).toEqual([a, b].sort());
  });

  it('пустая тема снимает тему', async () => {
    const a = await createLesson('Была');

    await service.setTopic({ topic: '', lessonIds: [a] }, NOW);

    expect(await topicOf(a)).toBe('');
  });

  it('неизвестный id — NotFoundError, ни одно занятие не изменилось', async () => {
    const a = await createLesson('Была');
    const unknown = new Types.ObjectId().toString();

    await expect(
      service.setTopic({ topic: 'Новая', lessonIds: [a, unknown] }, NOW),
    ).rejects.toBeInstanceOf(NotFoundError);

    expect(await topicOf(a)).toBe('Была');
    expect(rebuilt).toEqual([]);
  });

  it('дубли id схлопываются, пересборка один раз', async () => {
    const a = await createLesson();

    const result = await service.setTopic({ topic: 'Т', lessonIds: [a, a] }, NOW);

    expect(result).toHaveLength(1);
    expect(rebuilt).toEqual([a]);
  });

  it('ответ идёт в порядке входных id', async () => {
    const a = await createLesson();
    const b = await createLesson();
    const c = await createLesson();

    const result = await service.setTopic({ topic: 'Т', lessonIds: [c, a, b] }, NOW);

    expect(result.map((lesson) => lesson.id)).toEqual([c, a, b]);
  });
});
