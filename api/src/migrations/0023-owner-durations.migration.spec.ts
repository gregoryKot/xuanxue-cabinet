// Длительности владельца — против настоящей Mongo: пишем драйвером, читаем им же.
import type { Connection, mongo } from 'mongoose';
import { seedSchoolClasses } from './0001-school-classes.migration';
import { fullSchoolSchedule } from './0019-full-school-schedule.migration';
import { scheduleByMoment } from './0022-school-schedule-by-moment.migration';
import { ownerDurations } from './0023-owner-durations.migration';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';

interface Rule {
  weekday: number;
  time: string;
  durationMin: number;
}

describe('Миграция 0023-owner-durations', () => {
  let memory: MemoryMongo;
  let connection: Connection;

  function db(): mongo.Db {
    if (!connection.db) throw new Error('тестовое соединение с БД ещё не готово');
    return connection.db;
  }

  async function durationAt(weekday: number, time: string): Promise<number[]> {
    const docs = await db()
      .collection<{ rules: Rule[] }>('classes')
      .find({ rules: { $elemMatch: { weekday, time } } })
      .toArray();
    return docs.flatMap((doc) =>
      doc.rules
        .filter((rule) => rule.weekday === weekday && rule.time === time)
        .map((rule) => rule.durationMin),
    );
  }

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  beforeEach(async () => {
    await db().collection('classes').deleteMany({});
    await seedSchoolClasses.up(db());
    await fullSchoolSchedule.up(db());
    await scheduleByMoment.up(db());
  });

  it('веер Вт 18:30 — час, «Основы Дхармы» Пт 12:00 — полтора, соседние правила те же', async () => {
    const before = await durationAt(2, '10:00');

    const report = await ownerDurations.up(db());

    expect(await durationAt(2, '18:30')).toEqual([60]);
    expect(await durationAt(5, '12:00')).toEqual([90]);
    expect(await durationAt(2, '10:00')).toEqual(before);
    expect(report).toEqual(['Вт 18:30: 60 минут (1)', 'Пт 12:00: 90 минут (1)']);
  });

  it('второй прогон ничего не меняет и молчит', async () => {
    await ownerDurations.up(db());

    expect(await ownerDurations.up(db())).toEqual([]);
  });

  it('длительность, поправленная в кабинете, уступает слову владельца', async () => {
    await db()
      .collection('classes')
      .updateOne(
        { rules: { $elemMatch: { weekday: 5, time: '12:00' } } },
        { $set: { 'rules.$[rule].durationMin': 45 } },
        { arrayFilters: [{ 'rule.weekday': 5, 'rule.time': '12:00' }] },
      );

    await ownerDurations.up(db());

    expect(await durationAt(5, '12:00')).toEqual([90]);
  });
});
