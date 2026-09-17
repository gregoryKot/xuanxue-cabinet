// Против настоящей Mongo (mongodb-memory-server, не мок модели — CLAUDE.md
// «Тесты»): фильтр «вперёд от now», отменённые/прошедшие занятия, эффективные
// ссылка/пароль Zoom (join с классом), лимит по умолчанию и максимум (ТЗ
// docs/PLAN.md §11, «GET /api/me/lessons»).
import { DateTime } from 'luxon';
import type { Connection, Model } from 'mongoose';
import { Types } from 'mongoose';
import { ClassRecord, ClassSchema } from '../classes/class.schema';
import { LessonRecord, LessonSchema } from './lesson.schema';
import { MyLessonsService } from './my-lessons.service';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';

const NOW = DateTime.fromISO('2026-09-15T12:00:00Z', { zone: 'utc' });

describe('MyLessonsService', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let lessonModel: Model<LessonRecord>;
  let classModel: Model<ClassRecord>;
  let service: MyLessonsService;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    lessonModel = connection.model<LessonRecord>(LessonRecord.name, LessonSchema);
    classModel = connection.model<ClassRecord>(ClassRecord.name, ClassSchema);
    service = new MyLessonsService(lessonModel, classModel);
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  afterEach(async () => {
    await lessonModel.deleteMany({});
    await classModel.deleteMany({});
  });

  async function createClass(overrides: Partial<ClassRecord> = {}): Promise<string> {
    const cls = await classModel.create({
      title: 'Тайцзицюань',
      groupLabel: 'группа А',
      format: 'online',
      zoomLink: 'https://zoom.example/class',
      zoomPassword: 'class-pass',
      ...overrides,
    });
    return cls._id.toString();
  }

  async function createLesson(
    classId: string,
    overrides: Partial<LessonRecord> = {},
  ): Promise<string> {
    const lesson = await lessonModel.create({
      classId,
      startsAt: NOW.plus({ hours: 1 }).toJSDate(),
      durationMin: 60,
      topic: 'Форма 24',
      ...overrides,
    });
    return lesson._id.toString();
  }

  it('прошедшее занятие не отдаётся, предстоящее — да', async () => {
    const classId = await createClass();
    await createLesson(classId, { startsAt: NOW.minus({ hours: 1 }).toJSDate() });
    const upcomingId = await createLesson(classId, {
      startsAt: NOW.plus({ hours: 1 }).toJSDate(),
    });

    const list = await service.list({}, NOW);

    expect(list.map((l) => l.id)).toEqual([upcomingId]);
  });

  it('отменённое предстоящее занятие показано со статусом cancelled, отменённое прошедшее — нет', async () => {
    const classId = await createClass();
    await createLesson(classId, {
      startsAt: NOW.minus({ hours: 1 }).toJSDate(),
      status: 'cancelled',
    });
    const upcomingCancelledId = await createLesson(classId, {
      startsAt: NOW.plus({ hours: 2 }).toJSDate(),
      status: 'cancelled',
    });

    const list = await service.list({}, NOW);

    expect(list).toHaveLength(1);
    expect(list[0]?.id).toBe(upcomingCancelledId);
    expect(list[0]?.status).toBe('cancelled');
  });

  it('без override — ссылка и пароль подставляются из класса', async () => {
    const classId = await createClass();
    await createLesson(classId);

    const list = await service.list({}, NOW);

    expect(list[0]?.zoomLink).toBe('https://zoom.example/class');
    expect(list[0]?.zoomPassword).toBe('class-pass');
  });

  it('с override ссылки — пароль класса не наследуется', async () => {
    const classId = await createClass();
    await createLesson(classId, { zoomLinkOverride: 'https://zoom.example/one-off' });

    const list = await service.list({}, NOW);

    expect(list[0]?.zoomLink).toBe('https://zoom.example/one-off');
    expect(list[0]?.zoomPassword).toBeUndefined();
  });

  it('название класса и подпись группы приезжают из связанного класса', async () => {
    const classId = await createClass({ title: 'Ушу', groupLabel: 'вечерняя' });
    await createLesson(classId);

    const list = await service.list({}, NOW);

    expect(list[0]?.classTitle).toBe('Ушу');
    expect(list[0]?.groupLabel).toBe('вечерняя');
  });

  it('сортировка по времени начала, по возрастанию', async () => {
    const classId = await createClass();
    const laterId = await createLesson(classId, {
      startsAt: NOW.plus({ hours: 5 }).toJSDate(),
    });
    const soonerId = await createLesson(classId, {
      startsAt: NOW.plus({ hours: 1 }).toJSDate(),
    });

    const list = await service.list({}, NOW);

    expect(list.map((l) => l.id)).toEqual([soonerId, laterId]);
  });

  it('лимит по умолчанию — 10, больше не отдаёт', async () => {
    const classId = await createClass();
    for (let i = 0; i < 12; i += 1) {
      await createLesson(classId, { startsAt: NOW.plus({ hours: i + 1 }).toJSDate() });
    }

    const list = await service.list({}, NOW);

    expect(list).toHaveLength(10);
  });

  it('явный limit уважается', async () => {
    const classId = await createClass();
    for (let i = 0; i < 5; i += 1) {
      await createLesson(classId, { startsAt: NOW.plus({ hours: i + 1 }).toJSDate() });
    }

    const list = await service.list({ limit: 2 }, NOW);

    expect(list).toHaveLength(2);
  });

  it('класс занятия не найден (рассинхрон данных) — дата молча пропущена, не падает', async () => {
    await lessonModel.create({
      classId: new Types.ObjectId(),
      startsAt: NOW.plus({ hours: 1 }).toJSDate(),
      durationMin: 60,
      topic: 'Сирота',
    });

    const list = await service.list({}, NOW);

    expect(list).toEqual([]);
  });
});
