// buildLessonsFilter теперь ходит в базу (id курсов с тегом, ADR-0072) —
// против настоящей Mongo через mongodb-memory-server, не мока модели
// (CLAUDE.md «Тесты»: мок пропускает ошибки в самом запросе).
import { DateTime } from 'luxon';
import type { Connection, Model } from 'mongoose';
import { ClassRecord, ClassSchema } from '../classes/class.schema';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { LessonRecord, LessonSchema } from './lesson.schema';
import { buildLessonsFilter } from './lessons.queries';

const FROM = DateTime.fromISO('2026-09-01T00:00:00Z', { zone: 'utc' });
const TO = DateTime.fromISO('2026-09-30T00:00:00Z', { zone: 'utc' });
const WINDOW = { from: FROM.toISO() ?? '', to: TO.toISO() ?? '' };

describe('buildLessonsFilter', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let classModel: Model<ClassRecord>;
  let lessonModel: Model<LessonRecord>;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    classModel = connection.model<ClassRecord>(ClassRecord.name, ClassSchema);
    lessonModel = connection.model<LessonRecord>(LessonRecord.name, LessonSchema);
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  afterEach(async () => {
    await classModel.deleteMany({});
    await lessonModel.deleteMany({});
  });

  it('окно дат — всегда, остальные поля не добавляются сами', async () => {
    const filter = await buildLessonsFilter(WINDOW, FROM, TO, classModel);
    expect(filter).toEqual({
      startsAt: { $gte: FROM.toJSDate(), $lt: TO.toJSDate() },
    });
  });

  // ADR-0078: окно опущено только вместе с тегом (resolveLessonsWindow это
  // гарантирует раньше) — здесь просто форма фильтра без startsAt.
  it('окно не задано (undefined/undefined) — startsAt в фильтре отсутствует', async () => {
    const filter = await buildLessonsFilter(
      { tag: 'дракон' },
      undefined,
      undefined,
      classModel,
    );
    expect(filter).not.toHaveProperty('startsAt');
  });

  it('classId сужает выборку', async () => {
    const filter = await buildLessonsFilter(
      { ...WINDOW, classId: 'c1' },
      FROM,
      TO,
      classModel,
    );
    expect(filter.classId).toBe('c1');
  });

  // Пустая строка приходит от пустого поля фильтра на экране: это «фильтр не
  // задан», а не «тег — пустая строка», иначе список молча оказался бы пустым.
  it('пустая строка тега фильтром не становится', async () => {
    const filter = await buildLessonsFilter({ ...WINDOW, tag: '' }, FROM, TO, classModel);
    expect(filter).not.toHaveProperty('tags');
    expect(filter).not.toHaveProperty('$or');
  });

  it('дата без своих тегов находится по тегу своего курса (ADR-0072)', async () => {
    const cls = await classModel.create({
      title: 'Курс',
      format: 'online',
      tags: ['начинающие'],
    });
    const lesson = await lessonModel.create({
      classId: cls._id,
      startsAt: DateTime.fromISO('2026-09-03T16:00:00Z').toJSDate(),
      durationMin: 60,
    });

    const filter = await buildLessonsFilter(
      { ...WINDOW, tag: 'начинающие' },
      FROM,
      TO,
      classModel,
    );
    const found = await lessonModel.find(filter).lean();

    expect(found.map((l) => l._id.toString())).toEqual([lesson._id.toString()]);
  });

  // Два поля не смешиваются (ADR-0072 «Решение»): свой тег даты находится
  // сам по себе, даже когда у курса другой тег или тега нет вовсе.
  it('дата со своим тегом находится по нему же, даже если тег курса другой', async () => {
    const cls = await classModel.create({
      title: 'Курс',
      format: 'online',
      tags: ['начинающие'],
    });
    const lesson = await lessonModel.create({
      classId: cls._id,
      startsAt: DateTime.fromISO('2026-09-03T16:00:00Z').toJSDate(),
      durationMin: 60,
      tags: ['дракон'],
    });

    const filter = await buildLessonsFilter(
      { ...WINDOW, tag: 'дракон' },
      FROM,
      TO,
      classModel,
    );
    const found = await lessonModel.find(filter).lean();

    expect(found.map((l) => l._id.toString())).toEqual([lesson._id.toString()]);
  });

  it('чужая дата — другой курс без совпадения по тегу — не находится', async () => {
    const tagged = await classModel.create({
      title: 'Курс со совпадением',
      format: 'online',
      tags: ['начинающие'],
    });
    const other = await classModel.create({
      title: 'Другой курс',
      format: 'online',
      tags: ['продвинутые'],
    });
    const matching = await lessonModel.create({
      classId: tagged._id,
      startsAt: DateTime.fromISO('2026-09-03T16:00:00Z').toJSDate(),
      durationMin: 60,
    });
    await lessonModel.create({
      classId: other._id,
      startsAt: DateTime.fromISO('2026-09-04T16:00:00Z').toJSDate(),
      durationMin: 60,
    });

    const filter = await buildLessonsFilter(
      { ...WINDOW, tag: 'начинающие' },
      FROM,
      TO,
      classModel,
    );
    const found = await lessonModel.find(filter).lean();

    expect(found.map((l) => l._id.toString())).toEqual([matching._id.toString()]);
  });
});
