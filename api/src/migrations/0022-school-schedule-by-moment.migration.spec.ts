// Сведение расписания по моменту — против настоящей Mongo (CLAUDE.md «Тесты»):
// миграция пишет сырыми документами, и проверка «записали → прочитали»
// идёт тем же драйвером. Главное утверждение — инвариант, а не перечень
// правок: из любого начального состояния каждый момент таблицы владельца
// держит ровно один включённый слот, и называется он по таблице. Регресс
// 2026-10-02: 0019 молча пропустила правленный в кабинете «Цзибеньгун», и
// владелец увидел его в пятнице сам. Ссылки здесь — выдуманные строки:
// миграция переносит их как есть, не расшифровывая.
import type { Connection } from 'mongoose';
import { mongo } from 'mongoose';
import { seedSchoolClasses } from './0001-school-classes.migration';
import { fullSchoolSchedule } from './0019-full-school-schedule.migration';
import { FULL_WEEK, scheduleByMoment } from './0022-school-schedule-by-moment.migration';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';

const { ObjectId } = mongo;

interface Rule {
  _id: mongo.ObjectId;
  weekday: number;
  time: string;
  durationMin: number;
}

interface Doc {
  _id: mongo.ObjectId;
  title: string;
  groupLabel?: string;
  format?: string;
  location?: string;
  zoomLink?: string;
  zoomPassword?: string;
  active?: boolean;
  channelIds?: mongo.ObjectId[];
  rules?: Rule[];
}

// 24 слота таблицы 0019 и веер для начинающих в пятницу 19:30.
const SLOT_COUNT = 25;
const LINK_D = 'zoom-room-d';
const PASSWORD_D = 'pwd-d';
const LINK_MORNING = 'zoom-room-morning';

describe('Миграция 0022-school-schedule-by-moment', () => {
  let memory: MemoryMongo;
  let connection: Connection;

  function classes(): mongo.Collection<Doc> {
    if (!connection.db) throw new Error('тестовое соединение с БД ещё не готово');
    return connection.db.collection<Doc>('classes');
  }

  async function run(migration: { up(db: mongo.Db): Promise<unknown> }) {
    if (!connection.db) throw new Error('тестовое соединение с БД ещё не готово');
    return migration.up(connection.db);
  }

  const loadAll = (): Promise<Doc[]> => classes().find().sort({ _id: 1 }).toArray();

  /** Включённые слоты, у которых есть правило в этот момент. */
  async function holdersAt(weekday: number, time: string): Promise<Doc[]> {
    const all = await loadAll();
    return all.filter(
      (doc) =>
        doc.active !== false &&
        (doc.rules ?? []).some((rule) => rule.weekday === weekday && rule.time === time),
    );
  }

  async function onlyAt(weekday: number, time: string): Promise<Doc> {
    const [only, ...rest] = await holdersAt(weekday, time);
    if (!only || rest.length > 0) throw new Error(`на ${weekday} ${time} не один слот`);
    return only;
  }

  /** Инвариант полного расписания: каждый момент таблицы — у одного включённого
   * слота с названием, группой, форматом и местом из таблицы. */
  async function expectTableHolds(): Promise<void> {
    for (const slot of FULL_WEEK) {
      for (const rule of slot.rules) {
        const doc = await onlyAt(rule.weekday, rule.time);
        expect({
          title: doc.title,
          groupLabel: doc.groupLabel,
          format: doc.format,
          ...(slot.location === null ? {} : { location: doc.location }),
        }).toEqual({
          title: slot.title,
          groupLabel: slot.groupLabel,
          format: slot.format,
          ...(slot.location === null ? {} : { location: slot.location }),
        });
      }
    }
  }

  async function insertClass(
    title: string,
    rules: [number, string, number][],
    extra: Partial<Doc> = {},
  ): Promise<mongo.ObjectId> {
    const { insertedId } = await classes().insertOne({
      _id: new ObjectId(),
      title,
      groupLabel: '',
      format: 'online',
      active: true,
      rules: rules.map(([weekday, time, durationMin]) => ({
        _id: new ObjectId(),
        weekday,
        time,
        durationMin,
      })),
      ...extra,
    });
    return insertedId;
  }

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  beforeEach(async () => {
    await classes().deleteMany({});
    await connection.db?.collection('channels').deleteMany({});
  });

  it('прод 2026-10-02: правленный «Цзибеньгун» → «Тайцзицюань · средняя группа», Пт 18:30 — «все группы» с той же ссылкой', async () => {
    const channels = connection.db?.collection('channels');
    const school = await channels?.insertOne({ type: 'telegram', active: true });
    await channels?.insertOne({
      type: 'telegram',
      active: true,
      broadcastEligible: false,
    });
    await run(seedSchoolClasses);
    // В кабинете поменяли длительность — 0019 сочла слот тронутым.
    await classes().updateOne(
      { title: 'Цзибеньгун', groupLabel: '' },
      {
        $set: {
          'rules.$[].durationMin': 90,
          zoomLink: LINK_D,
          zoomPassword: PASSWORD_D,
        },
      },
    );
    const before = await classes().findOne({ title: 'Цзибеньгун', groupLabel: '' });
    await run(fullSchoolSchedule);
    expect((await onlyAt(5, '18:30')).title).toBe('Цзибеньгун');

    const report = await run(scheduleByMoment);

    const wednesday = await onlyAt(3, '18:30');
    expect(wednesday._id).toEqual(before?._id);
    expect(wednesday.title).toBe('Тайцзицюань');
    expect(wednesday.groupLabel).toBe('средняя группа');
    expect(wednesday.zoomLink).toBe(LINK_D);
    // Длительность, поправленная в кабинете, остаётся.
    expect(wednesday.rules?.map((rule) => rule.durationMin)).toEqual([90]);
    const friday = await onlyAt(5, '18:30');
    expect(friday.title).toBe('Тайцзицюань');
    expect(friday.groupLabel).toBe('все группы');
    expect(friday.zoomLink).toBe(LINK_D);
    expect(friday.zoomPassword).toBe(PASSWORD_D);
    // Новый слот подписан на каналы школы, но не на личный канал ученика.
    expect(friday.channelIds).toEqual([school?.insertedId]);
    expect(report).toEqual(
      expect.arrayContaining([
        '«Цзибеньгун» → «Тайцзицюань · средняя группа»',
        'заведено «Тайцзицюань · все группы»',
      ]),
    );
    await expectTableHolds();
  });

  it('все слоты 0001 правлены — после 0019 и 0022 вся неделя названа по таблице', async () => {
    await run(seedSchoolClasses);
    await classes().updateMany({}, { $inc: { 'rules.$[].durationMin': 15 } });
    await classes().updateOne(
      { title: 'Утреннее занятие школы Сюань-Сюэ' },
      { $set: { zoomLink: LINK_MORNING } },
    );
    await run(fullSchoolSchedule);

    await run(scheduleByMoment);

    await expectTableHolds();
    const active = (await loadAll()).filter((doc) => doc.active !== false);
    expect(active).toHaveLength(SLOT_COUNT);
    // Чт 08:00 и Пт 09:00 — та же комната, что Вт 08:00; пароля у неё нет.
    expect((await onlyAt(4, '08:00')).zoomLink).toBe(LINK_MORNING);
    expect((await onlyAt(5, '09:00')).zoomLink).toBe(LINK_MORNING);
    expect((await onlyAt(5, '09:00')).zoomPassword).toBeUndefined();
  });

  it('после чистых 0001 и 0019 только заводит веер Пт 19:30 в комнате Пт 18:30', async () => {
    await run(seedSchoolClasses);
    await classes().updateOne(
      { title: 'Цзибеньгун', groupLabel: '' },
      { $set: { zoomLink: LINK_D } },
    );
    await run(fullSchoolSchedule);
    const before = await loadAll();

    expect(await run(scheduleByMoment)).toEqual([
      'заведено «Занятие с веером тайцзи · начинающие»',
    ]);
    expect(await run(scheduleByMoment)).toEqual([]);

    const after = await loadAll();
    expect(after.slice(0, before.length)).toEqual(before);
    const fan = await onlyAt(5, '19:30');
    expect(fan.rules?.map((rule) => rule.durationMin)).toEqual([30]);
    expect(fan.zoomLink).toBe(LINK_D);
    await expectTableHolds();
  });

  it('идемпотентна после сведения: второй прогон — пустой отчёт и тот же снимок', async () => {
    await run(seedSchoolClasses);
    await classes().updateMany({}, { $set: { 'rules.$[].durationMin': 45 } });
    await run(scheduleByMoment);
    const after = await loadAll();

    expect(await run(scheduleByMoment)).toEqual([]);
    expect(await loadAll()).toEqual(after);
  });

  it('свой момент учителя вне таблицы остаётся у слота', async () => {
    await run(seedSchoolClasses);
    const id = (await classes().findOne({ title: 'Цзибеньгун', groupLabel: '' }))?._id;
    await classes().updateOne(
      { _id: id },
      {
        $push: {
          rules: { _id: new ObjectId(), weekday: 4, time: '12:00', durationMin: 60 },
        },
      },
    );

    await run(scheduleByMoment);

    const home = await classes().findOne({ _id: id });
    expect(home?.rules?.map((rule) => `${rule.weekday} ${rule.time}`)).toEqual([
      '3 18:30',
      '4 12:00',
    ]);
    await expectTableHolds();
  });

  it('из нескольких слотов дом — тот, где больше моментов, затем включённый, затем раньше по правилам', async () => {
    const wednesday = await insertClass('Среда в парке', [[3, '19:00', 60]]);
    const monday = await insertClass('Понедельник в парке', [[1, '19:00', 60]]);
    const tuesday = await insertClass('Вторник в парке', [[2, '19:00', 75]], {
      active: false,
    });

    const report = await run(scheduleByMoment);

    const home = await classes().findOne({ _id: monday });
    expect(home?.title).toBe('Тайцзицюань');
    expect(home?.groupLabel).toBe('новички');
    expect(home?.rules?.map((r) => `${r.weekday} ${r.time} ${r.durationMin}`)).toEqual([
      '1 19:00 60',
      '2 19:00 75',
      '3 19:00 60',
    ]);
    expect((await classes().findOne({ _id: wednesday }))?.active).toBe(false);
    // Выключенный и до миграции — не «выключено опустевшее».
    expect((await classes().findOne({ _id: tuesday }))?.rules).toEqual([]);
    expect(report).toContain('выключено опустевшее «Среда в парке»');
    expect(report).not.toContain('выключено опустевшее «Вторник в парке»');
    await expectTableHolds();
  });

  it('недостающий момент слота получает длительность из таблицы', async () => {
    const id = await insertClass('Парк по понедельникам', [[1, '19:00', 60]]);

    await run(scheduleByMoment);

    const home = await classes().findOne({ _id: id });
    expect(home?.rules?.map((r) => `${r.weekday} ${r.time} ${r.durationMin}`)).toEqual([
      '1 19:00 60',
      '2 19:00 60',
      '3 19:00 60',
    ]);
  });

  it('документ без правил, заведённый руками, не трогается и не выключается', async () => {
    const { insertedId } = await classes().insertOne({
      _id: new ObjectId(),
      title: 'Черновик',
    });

    await run(scheduleByMoment);

    expect(await classes().findOne({ _id: insertedId })).toEqual({
      _id: insertedId,
      title: 'Черновик',
    });
    await expectTableHolds();
  });
});
