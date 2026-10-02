// Занятие для преподавателей — против настоящей Mongo, после всей цепочки
// полного расписания; читаем моделью (read-after-write): правило «раз в две
// недели» обязано пережить схему, иначе планировщик сделал бы его еженедельным.
import type { Connection, Model } from 'mongoose';
import { seedSchoolClasses } from './0001-school-classes.migration';
import { fullSchoolSchedule } from './0019-full-school-schedule.migration';
import { scheduleByMoment } from './0022-school-schedule-by-moment.migration';
import { ownerDurations } from './0023-owner-durations.migration';
import { teachersClass } from './0024-teachers-class.migration';
import { ClassRecord } from '../classes/class.schema';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';

const TITLE = 'Занятие для преподавателей';
const LINK = 'zoom-room-friday';

describe('Миграция 0024-teachers-class', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let model: Model<ClassRecord>;

  function db() {
    if (!connection.db) throw new Error('тестовое соединение с БД ещё не готово');
    return connection.db;
  }

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    model = connection.model<ClassRecord>(ClassRecord.name);
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  beforeEach(async () => {
    await Promise.all([model.deleteMany({}), db().collection('channels').deleteMany({})]);
    await seedSchoolClasses.up(db());
    await model.updateOne(
      { title: 'Цзибеньгун', groupLabel: '' },
      { $set: { zoomLink: LINK } },
    );
    await fullSchoolSchedule.up(db());
    await scheduleByMoment.up(db());
    await ownerDurations.up(db());
  });

  it('заводит пятницу 20:00 раз в две недели с 2 октября, в комнате Пт 18:30 и в общем канале', async () => {
    const { insertedId: school } = await db()
      .collection('channels')
      .insertOne({ type: 'telegram', active: true });

    const report = await teachersClass.up(db());

    const created = await model.findOne({ title: TITLE }).lean();
    expect(created?.format).toBe('online');
    expect(created?.active).toBe(true);
    expect(created?.zoomLink).toBe(LINK);
    expect(created?.channelIds.map(String)).toEqual([String(school)]);
    expect(
      created?.rules.map(({ weekday, time, durationMin, everyWeeks, startsOn }) => ({
        weekday,
        time,
        durationMin,
        everyWeeks,
        startsOn,
      })),
    ).toEqual([
      {
        weekday: 5,
        time: '20:00',
        durationMin: 60,
        everyWeeks: 2,
        startsOn: '2026-10-02',
      },
    ]);
    expect(report).toEqual([
      'заведено «Занятие для преподавателей»: Пт 20:00, раз в 2 недели с 2026-10-02',
    ]);
  });

  it('второй прогон молчит и дубля не заводит', async () => {
    await teachersClass.up(db());

    expect(await teachersClass.up(db())).toEqual([]);
    expect(await model.countDocuments({ title: TITLE })).toBe(1);
  });

  it('Пт 20:00 уже занято своим занятием учителя — не заводит, пишет в отчёт', async () => {
    await model.create({
      title: 'Свой вечер',
      format: 'online',
      rules: [{ weekday: 5, time: '20:00', durationMin: 60 }],
    });

    const report = await teachersClass.up(db());

    expect(await model.countDocuments({ title: TITLE })).toBe(0);
    expect(report).toEqual([
      'Пт 20:00 уже занято «Свой вечер» — занятие для преподавателей не заведено',
    ]);
  });
});
