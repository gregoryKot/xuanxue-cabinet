// Против настоящей Mongo (mongodb-memory-server, не мок модели — CLAUDE.md
// «Тесты»): окно «последние N дней от now», отменённое занятие не в счёт ни
// в числителе, ни в знаменателе, занятие вне окна не считается. Образец
// обвязки — my-lessons-archive.service.spec.ts.
import { DateTime } from 'luxon';
import { Types, type Connection, type Model } from 'mongoose';
import { LessonRecord, LessonSchema } from './lesson.schema';
import { LessonRecordingSummaryService } from './lesson-recording-summary.service';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';

const NOW = DateTime.fromISO('2026-09-15T12:00:00Z', { zone: 'utc' });

describe('LessonRecordingSummaryService', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let lessonModel: Model<LessonRecord>;
  let service: LessonRecordingSummaryService;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    lessonModel = connection.model<LessonRecord>(LessonRecord.name, LessonSchema);
    service = new LessonRecordingSummaryService(lessonModel);
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  afterEach(async () => {
    await lessonModel.deleteMany({});
  });

  async function createLesson(overrides: Partial<LessonRecord> = {}): Promise<void> {
    await lessonModel.create({
      classId: new Types.ObjectId(),
      startsAt: NOW.minus({ days: 1 }).toJSDate(),
      durationMin: 60,
      topic: 'Форма 24',
      ...overrides,
    });
  }

  it('пустая база — периода и нулей достаточно, дальше честный текст рисует shared-форматтер', async () => {
    const result = await service.get(NOW);

    expect(result).toEqual({ periodDays: 30, lessonsPast: 0, lessonsWithRecording: 0 });
  });

  it('занятие в окне считается, занятие вне окна — нет', async () => {
    await createLesson({ startsAt: NOW.minus({ days: 10 }).toJSDate() });
    await createLesson({ startsAt: NOW.minus({ days: 40 }).toJSDate() });
    await createLesson({ startsAt: NOW.plus({ days: 1 }).toJSDate() });

    const result = await service.get(NOW);

    expect(result.lessonsPast).toBe(1);
  });

  it('у занятия с записью lessonsWithRecording растёт, без записи — нет', async () => {
    await createLesson({
      startsAt: NOW.minus({ days: 5 }).toJSDate(),
      recordings: [{ title: 'Запись', url: 'https://cloud.example/rec' }],
    });
    await createLesson({ startsAt: NOW.minus({ days: 6 }).toJSDate() });

    const result = await service.get(NOW);

    expect(result.lessonsPast).toBe(2);
    expect(result.lessonsWithRecording).toBe(1);
  });

  it('отменённое занятие не считается ни прошедшим, ни с записью', async () => {
    await createLesson({
      startsAt: NOW.minus({ days: 2 }).toJSDate(),
      status: 'cancelled',
      recordings: [{ title: 'Запись', url: 'https://cloud.example/rec' }],
    });
    await createLesson({ startsAt: NOW.minus({ days: 3 }).toJSDate() });

    const result = await service.get(NOW);

    expect(result.lessonsPast).toBe(1);
    expect(result.lessonsWithRecording).toBe(0);
  });

  // CLAUDE.md «Время»: переход летнего времени Asia/Jerusalem обязателен для
  // любого кода, который считает «когда». `now` берётся сразу после
  // перехода — окно считается вычитанием 30 дней из UTC-момента (не по
  // местным часам школы), и смена часового пояса школы внутри периода не
  // должна сдвинуть границу окна.
  it('переход на зимнее время Asia/Jerusalem — окно считается в UTC, а не по местным часам школы', async () => {
    // Последнее воскресенье октября 2026 — переход с IDT (UTC+3) на IST
    // (UTC+2) в Asia/Jerusalem (тот же момент, что в
    // my-lessons-archive.service.spec.ts).
    const now = DateTime.fromObject(
      { year: 2026, month: 10, day: 25, hour: 5, minute: 0 },
      { zone: 'Asia/Jerusalem' },
    );
    const beforeTransition = DateTime.fromObject(
      { year: 2026, month: 10, day: 24, hour: 20, minute: 0 },
      { zone: 'Asia/Jerusalem' },
    );
    expect(beforeTransition.offset).not.toBe(now.offset);

    await createLesson({ startsAt: now.toUTC().minus({ days: 20 }).toJSDate() });
    await createLesson({ startsAt: now.toUTC().minus({ days: 40 }).toJSDate() });

    const result = await service.get(now.toUTC());

    expect(result.lessonsPast).toBe(1);
  });
});
