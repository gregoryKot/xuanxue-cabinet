// Против настоящей Mongo (mongodb-memory-server, не мок модели — CLAUDE.md
// «Тесты»): фильтр «ближайшие» и окно `from <= startsAt < to`, сортировка,
// лимит, проекция без Zoom и отказ при занятии без класса. Маршрут открыт без
// сессии (ADR-0170), поэтому утечку Zoom и тихую потерю занятия держит именно
// этот спек: юнит-джоба e2e не видит, а покрытие api должно расти, не падать.
import { DateTime } from 'luxon';
import type { Connection, Model } from 'mongoose';
import { Types } from 'mongoose';
import { ClassRecord, ClassSchema } from '../classes/class.schema';
import { InvalidInputError } from '../common/errors';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { LessonRecord, LessonSchema } from './lesson.schema';
import { PublicLessonsService } from './public-lessons.service';

const NOW = DateTime.fromISO('2026-10-05T12:00:00Z', { zone: 'utc' });
const WINDOW_FROM = '2026-10-10T00:00:00Z';
const WINDOW_TO = '2026-10-17T00:00:00Z';
const LESSONS_OVER_DEFAULT_LIMIT = 12;
const LESSONS_IN_WIDE_WINDOW = 15;

describe('PublicLessonsService', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let lessonModel: Model<LessonRecord>;
  let classModel: Model<ClassRecord>;
  let service: PublicLessonsService;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    lessonModel = connection.model<LessonRecord>(LessonRecord.name, LessonSchema);
    classModel = connection.model<ClassRecord>(ClassRecord.name, ClassSchema);
    service = new PublicLessonsService(lessonModel, classModel);
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

  describe('режим «ближайшие»', () => {
    it('прошедшее занятие не отдаётся, предстоящее — да', async () => {
      const classId = await createClass();
      await createLesson(classId, { startsAt: NOW.minus({ hours: 1 }).toJSDate() });
      const upcomingId = await createLesson(classId);

      const list = await service.list({}, NOW);

      expect(list.map((l) => l.id)).toEqual([upcomingId]);
    });

    it('занятие ровно в now включено', async () => {
      const classId = await createClass();
      const atNowId = await createLesson(classId, { startsAt: NOW.toJSDate() });

      const list = await service.list({}, NOW);

      expect(list.map((l) => l.id)).toEqual([atNowId]);
    });

    it('отменённое предстоящее занятие показано со статусом cancelled', async () => {
      const classId = await createClass();
      const cancelledId = await createLesson(classId, { status: 'cancelled' });

      const list = await service.list({}, NOW);

      expect(list).toHaveLength(1);
      expect(list[0]?.id).toBe(cancelledId);
      expect(list[0]?.status).toBe('cancelled');
    });

    it('сортировка по возрастанию startsAt', async () => {
      const classId = await createClass();
      const laterId = await createLesson(classId, {
        startsAt: NOW.plus({ hours: 5 }).toJSDate(),
      });
      const soonerId = await createLesson(classId, {
        startsAt: NOW.plus({ hours: 2 }).toJSDate(),
      });

      const list = await service.list({}, NOW);

      expect(list.map((l) => l.id)).toEqual([soonerId, laterId]);
    });

    it('лимит по умолчанию — 10 из 12', async () => {
      const classId = await createClass();
      for (let i = 0; i < LESSONS_OVER_DEFAULT_LIMIT; i += 1) {
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
  });

  describe('режим «окно» from/to', () => {
    const query = { from: WINDOW_FROM, to: WINDOW_TO };
    const from = DateTime.fromISO(WINDOW_FROM, { zone: 'utc' });
    const to = DateTime.fromISO(WINDOW_TO, { zone: 'utc' });

    it('from включено, to исключено, раньше from — нет', async () => {
      const classId = await createClass();
      await createLesson(classId, { startsAt: from.minus({ minutes: 1 }).toJSDate() });
      const atFromId = await createLesson(classId, { startsAt: from.toJSDate() });
      const insideId = await createLesson(classId, {
        startsAt: from.plus({ days: 2 }).toJSDate(),
      });
      await createLesson(classId, { startsAt: to.toJSDate() });

      const list = await service.list(query, NOW);

      expect(list.map((l) => l.id)).toEqual([atFromId, insideId]);
    });

    it('now окно не сужает: занятие до now, но внутри окна, отдаётся', async () => {
      const classId = await createClass();
      const beforeNowId = await createLesson(classId, {
        startsAt: NOW.minus({ hours: 3 }).toJSDate(),
      });

      const list = await service.list(
        {
          from: NOW.minus({ days: 1 }).toISO() ?? '',
          to: NOW.plus({ days: 1 }).toISO() ?? '',
        },
        NOW,
      );

      expect(list.map((l) => l.id)).toEqual([beforeNowId]);
    });

    it('без лимита: 15 занятий в окне отдаются все', async () => {
      const classId = await createClass();
      for (let i = 0; i < LESSONS_IN_WIDE_WINDOW; i += 1) {
        await createLesson(classId, { startsAt: from.plus({ hours: i + 1 }).toJSDate() });
      }

      const list = await service.list(query, NOW);

      expect(list).toHaveLength(LESSONS_IN_WIDE_WINDOW);
    });

    it('пустое окно — пустой массив', async () => {
      const classId = await createClass();
      await createLesson(classId);

      await expect(service.list(query, NOW)).resolves.toEqual([]);
    });
  });

  describe('проекция', () => {
    it('Zoom класса и занятия в ответ не попадает, classId — id класса', async () => {
      const classId = await createClass();
      await createLesson(classId, { zoomLinkOverride: 'https://zoom.example/one-off' });

      const list = await service.list({}, NOW);

      expect(list).toHaveLength(1);
      const dto = list[0];
      expect(dto).not.toHaveProperty('zoomLink');
      expect(dto).not.toHaveProperty('zoomPassword');
      expect(dto).not.toHaveProperty('zoomLinkOverride');
      expect(dto?.classId).toBe(classId);
      expect(dto?.classTitle).toBe('Тайцзицюань');
    });

    it('адрес зала приезжает из класса, у класса без адреса ключа location нет', async () => {
      const withAddressId = await createClass({ location: 'Тель-Авив, зал 3' });
      const withoutAddressId = await createClass({ groupLabel: 'без зала' });
      await createLesson(withAddressId, { startsAt: NOW.plus({ hours: 1 }).toJSDate() });
      await createLesson(withoutAddressId, {
        startsAt: NOW.plus({ hours: 2 }).toJSDate(),
      });

      const list = await service.list({}, NOW);

      expect(list[0]?.location).toBe('Тель-Авив, зал 3');
      expect(list[1]).not.toHaveProperty('location');
    });
  });

  it('занятие с несуществующим классом — ошибка с id занятия, а не пропуск', async () => {
    const lessonId = await createLesson(new Types.ObjectId().toString());

    const attempt = service.list({}, NOW);

    await expect(attempt).rejects.toThrow();
    await expect(attempt).rejects.toThrow(lessonId);
  });

  it('from без to — InvalidInputError', async () => {
    await expect(service.list({ from: WINDOW_FROM }, NOW)).rejects.toThrow(
      InvalidInputError,
    );
  });
});
