// Против настоящей Mongo (mongodb-memory-server, не мок модели — CLAUDE.md
// «Тесты»): фильтр «назад от now», отменённые прошедшие занятия видны со
// своим статусом, лимит по умолчанию и явный, класс не найден — дата
// пропущена (ТЗ docs/PLAN.md §14, «3.3. Архив занятий у ученика»).
import { DateTime } from 'luxon';
import type { Connection, Model } from 'mongoose';
import { Types } from 'mongoose';
import { ClassRecord, ClassSchema } from '../classes/class.schema';
import { LessonRecord, LessonSchema } from './lesson.schema';
import { MyLessonsArchiveService } from './my-lessons-archive.service';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';

const NOW = DateTime.fromISO('2026-09-15T12:00:00Z', { zone: 'utc' });

describe('MyLessonsArchiveService', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let lessonModel: Model<LessonRecord>;
  let classModel: Model<ClassRecord>;
  let service: MyLessonsArchiveService;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    lessonModel = connection.model<LessonRecord>(LessonRecord.name, LessonSchema);
    classModel = connection.model<ClassRecord>(ClassRecord.name, ClassSchema);
    service = new MyLessonsArchiveService(lessonModel, classModel);
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
      startsAt: NOW.minus({ hours: 1 }).toJSDate(),
      durationMin: 60,
      topic: 'Форма 24',
      ...overrides,
    });
    return lesson._id.toString();
  }

  it('прошедшее занятие в архиве, будущее — нет', async () => {
    const classId = await createClass();
    const pastId = await createLesson(classId, {
      startsAt: NOW.minus({ hours: 1 }).toJSDate(),
    });
    await createLesson(classId, { startsAt: NOW.plus({ hours: 1 }).toJSDate() });

    const list = await service.list({}, NOW);

    expect(list.map((l) => l.id)).toEqual([pastId]);
  });

  it('сортировка по времени начала, по убыванию', async () => {
    const classId = await createClass();
    const earlierId = await createLesson(classId, {
      startsAt: NOW.minus({ hours: 5 }).toJSDate(),
    });
    const laterId = await createLesson(classId, {
      startsAt: NOW.minus({ hours: 1 }).toJSDate(),
    });

    const list = await service.list({}, NOW);

    expect(list.map((l) => l.id)).toEqual([laterId, earlierId]);
  });

  it('отменённое прошедшее занятие видно со статусом cancelled', async () => {
    const classId = await createClass();
    const cancelledId = await createLesson(classId, { status: 'cancelled' });

    const list = await service.list({}, NOW);

    expect(list).toHaveLength(1);
    expect(list[0]?.id).toBe(cancelledId);
    expect(list[0]?.status).toBe('cancelled');
  });

  it('лимит по умолчанию — 20, больше не отдаёт', async () => {
    const classId = await createClass();
    for (let i = 0; i < 22; i += 1) {
      await createLesson(classId, { startsAt: NOW.minus({ hours: i + 1 }).toJSDate() });
    }

    const list = await service.list({}, NOW);

    expect(list).toHaveLength(20);
  });

  it('явный limit уважается', async () => {
    const classId = await createClass();
    for (let i = 0; i < 5; i += 1) {
      await createLesson(classId, { startsAt: NOW.minus({ hours: i + 1 }).toJSDate() });
    }

    const list = await service.list({ limit: 2 }, NOW);

    expect(list).toHaveLength(2);
  });

  it('класс занятия не найден (рассинхрон данных) — дата молча пропущена, не падает', async () => {
    await lessonModel.create({
      classId: new Types.ObjectId(),
      startsAt: NOW.minus({ hours: 1 }).toJSDate(),
      durationMin: 60,
      topic: 'Сирота',
    });

    const list = await service.list({}, NOW);

    expect(list).toEqual([]);
  });

  it('название класса и подпись группы приезжают из связанного класса', async () => {
    const classId = await createClass({ title: 'Ушу', groupLabel: 'вечерняя' });
    await createLesson(classId);

    const list = await service.list({}, NOW);

    expect(list[0]?.classTitle).toBe('Ушу');
    expect(list[0]?.groupLabel).toBe('вечерняя');
  });

  it('запись с записью занятия — видна с корректным видом (ссылка/telegram)', async () => {
    const classId = await createClass();
    await createLesson(classId, {
      recordings: [
        { title: 'Занятие целиком', url: 'https://cloud.example/rec-1' },
        { title: 'В канале', telegramFileId: 'BAACAgIA-secret' },
      ],
    });

    const list = await service.list({}, NOW);

    expect(list[0]?.recordings).toEqual([
      { title: 'Занятие целиком', url: 'https://cloud.example/rec-1' },
      { title: 'В канале', inTelegramOnly: true },
    ]);
  });

  // CLAUDE.md «Время»: переход летнего времени Asia/Jerusalem обязателен для
  // любого кода, который считает «когда». Занятие ровно на границе перехода
  // должно попадать в архив (или нет) по сравнению реальных моментов
  // времени в UTC, не «по местным часам» школы/зрителя.
  it('переход на зимнее время Asia/Jerusalem — занятие на границе фильтруется по реальному времени', async () => {
    // Последнее воскресенье октября 2026 — переход с IDT (UTC+3) на IST
    // (UTC+2) в Asia/Jerusalem.
    const beforeTransition = DateTime.fromObject(
      { year: 2026, month: 10, day: 24, hour: 20, minute: 0 },
      { zone: 'Asia/Jerusalem' },
    );
    const now = DateTime.fromObject(
      { year: 2026, month: 10, day: 25, hour: 5, minute: 0 },
      { zone: 'Asia/Jerusalem' },
    );
    expect(beforeTransition.offset).not.toBe(now.offset);

    const classId = await createClass();
    const pastId = await createLesson(classId, {
      startsAt: beforeTransition.toUTC().toJSDate(),
    });
    const futureId = await createLesson(classId, {
      startsAt: now.plus({ minutes: 1 }).toUTC().toJSDate(),
    });

    const list = await service.list({}, now.toUTC());

    expect(list.map((l) => l.id)).toEqual([pastId]);
    expect(list.map((l) => l.id)).not.toContain(futureId);
  });
});
