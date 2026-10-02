// Миграция пишет сырыми документами мимо схемы, а читает их приложение, поэтому
// всё проверяем против настоящей Mongo и читаем моделью: записали драйвером →
// увидели готовые слоты (CLAUDE.md «Тесты», read-after-write). Ссылки Zoom здесь
// выдуманные и зашифрованы тем же `encrypt`, что в базе: шифротекст каждый раз
// другой, поэтому равенство строк после миграции доказывает копию «как есть»,
// без расшифровки и повторного шифрования. Таблица ожидаемого расписания
// написана заново и в другой записи (число дня, время, длительность), а не
// взята из миграции: общая опечатка иначе осталась бы незамеченной.
import { Types, type Connection, type Model } from 'mongoose';
import { DEFAULT_LEAD_MINUTES, SCHOOL_TZ } from '@xuanxue/shared';
import { seedSchoolClasses } from './0001-school-classes.migration';
import {
  fullSchoolSchedule,
  growRules,
  parseRule,
} from './0019-full-school-schedule.migration';
import { ChannelRecord } from '../channels/channel.schema';
import { ClassRecord, type LeanScheduleRule } from '../classes/class.schema';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { encrypt } from '../utils/encryption';

interface LeanClass extends Omit<ClassRecord, 'rules'> {
  _id: Types.ObjectId;
  rules: LeanScheduleRule[];
  createdAt: Date;
  updatedAt: Date;
}

const EXPECTED_CLASSES = 24;
const EXPECTED_RULES = 30;
const GONDA = 'Парк Гонда, Тель-Авив';
const WOLFSON = 'Парк Вольфсон, Тель-Авив';
const ARKAVI = 'Аркави 3, Тель-Авив';
const MORNING = 'Утреннее занятие школы Сюань-Сюэ';

// Название, подпись группы, формат, зал, правила «день время минуты»
// (день: 0 — воскресенье … 6 — суббота).
type Expected = [string, string, string, string | undefined, string[]];
const EXPECTED: Expected[] = [
  ['Медитация чжи-гуань', '', 'both', ARKAVI, ['0 08:00 60', '3 08:00 60']],
  ['Цигун для глаз и массаж туйна', '', 'online', undefined, ['0 10:00 60']],
  ['Тайцзицюань', 'продвинутые', 'offline', GONDA, ['0 18:30 90']],
  ['Тайцзицюань', 'начинающие', 'offline', GONDA, ['0 20:00 60', '4 18:30 90']],
  ['Нейгун и тайцзицюань', '', 'both', WOLFSON, ['1 08:00 60', '2 08:00 60']],
  ['Тайцзицюань', 'средняя группа', 'online', undefined, ['1 10:00 60', '2 10:00 60']],
  ['Тайцзицюань', 'старшая группа', 'online', undefined, ['1 18:30 60']],
  [
    'Тайцзицюань',
    'новички',
    'offline',
    GONDA,
    ['1 19:00 60', '2 19:00 60', '3 19:00 60'],
  ],
  ['Парная работа в илицюань', '', 'offline', GONDA, ['1 20:00 60']],
  ['Занятие с веером тайцзи', '', 'online', undefined, ['2 18:30 90']],
  ['Тайцзицюань', 'младшая группа', 'online', undefined, ['2 20:00 60']],
  ['Нейгун', 'старшая группа', 'online', undefined, ['3 10:00 60']],
  ['Тайцзицюань', 'средняя группа', 'online', undefined, ['3 18:30 60']],
  ['Парная работа тайцзицюань и илицюань', '', 'offline', GONDA, ['3 20:00 60']],
  ['Тайцзицюань', 'младшая группа', 'online', undefined, ['4 08:00 60']],
  ['Медитация чжи-гуань', '', 'online', undefined, ['4 10:00 60']],
  ['Нейгун', '', 'offline', GONDA, ['4 20:00 60']],
  ['Тайцзицигун', '', 'both', GONDA, ['5 09:00 90']],
  ['Цигун для глаз', '', 'offline', GONDA, ['5 10:30 30']],
  ['Основы Дхармы', '', 'online', undefined, ['5 12:00 60']],
  ['Тайцзицюань', 'все группы', 'online', undefined, ['5 18:30 60']],
  ['Медитация чжи-гуань', 'продвинутые', 'offline', ARKAVI, ['6 16:00 120']],
  ['Медитация чжи-гуань', 'начинающие', 'both', ARKAVI, ['6 18:00 90']],
  ['Тайцзицигун', '', 'offline', GONDA, ['6 20:00 60']],
];

const sealed = (text: string): string => encrypt(text) ?? text;
const ruleKeys = (cls: LeanClass): string[] =>
  cls.rules.map((r) => `${r.weekday} ${r.time} ${r.durationMin}`).sort();

/** Слот, у которого есть правило в этот момент; он обязан быть один. */
function slotAt(classes: LeanClass[], weekday: number, time: string): LeanClass {
  const found = classes.filter((cls) =>
    cls.rules.some((rule) => rule.weekday === weekday && rule.time === time),
  );
  const [only] = found;
  if (found.length !== 1 || !only) {
    throw new Error(`на момент ${weekday} ${time} слотов: ${found.length}`);
  }
  return only;
}

describe('Миграция 0019-full-school-schedule', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let model: Model<ClassRecord>;
  let channelModel: Model<ChannelRecord>;

  function db(): NonNullable<Connection['db']> {
    if (!connection.db) throw new Error('тестовое соединение с БД ещё не готово');
    return connection.db;
  }

  const loadAll = (): Promise<LeanClass[]> =>
    model.find().sort({ _id: 1 }).lean<LeanClass[]>();

  async function migrate(): Promise<LeanClass[]> {
    await fullSchoolSchedule.up(db());
    return loadAll();
  }

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    model = connection.model<ClassRecord>(ClassRecord.name);
    channelModel = connection.model<ChannelRecord>(ChannelRecord.name);
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  beforeEach(async () => {
    await Promise.all([model.deleteMany({}), channelModel.deleteMany({})]);
    await seedSchoolClasses.up(db());
  });

  it('на базе после 0001 даёт 24 слота и 30 правил ровно по таблице владельца', async () => {
    const classes = await migrate();

    expect(classes).toHaveLength(EXPECTED_CLASSES);
    expect(classes.reduce((sum, cls) => sum + cls.rules.length, 0)).toBe(EXPECTED_RULES);
    for (const [title, groupLabel, format, location, rules] of EXPECTED) {
      const first = rules[0] ?? '';
      const found = classes.find((cls) => ruleKeys(cls).includes(first));
      expect({
        title: found?.title,
        groupLabel: found?.groupLabel,
        format: found?.format,
        location: found?.location,
        rules: found ? ruleKeys(found) : [],
      }).toEqual({ title, groupLabel, format, location, rules: [...rules].sort() });
    }
  });

  it('слоты полны умолчаний схемы, у правил свои _id, ссылок нет', async () => {
    const classes = await migrate();

    expect(classes.every((cls) => cls.tz === SCHOOL_TZ && cls.active)).toBe(true);
    expect(classes.every((cls) => cls.leadMinutes === DEFAULT_LEAD_MINUTES)).toBe(true);
    expect(classes.every((cls) => cls.updatedAt instanceof Date)).toBe(true);
    expect(slotAt(classes, 4, '20:00').tags).toEqual([]);
    const ruleIds = classes.flatMap((cls) => cls.rules.map((rule) => String(rule._id)));
    expect(new Set(ruleIds).size).toBe(EXPECTED_RULES);
    // Миграция только копирует лежащее в базе: из ничего ссылки не появляются.
    expect(classes.every((cls) => !cls.zoomLink && !cls.zoomPassword)).toBe(true);
  });

  it('у переименованного слота остаются ссылка, ведущий, каналы и _id документа и правил', async () => {
    const link = sealed('https://zoom.example/j/000');
    const password = sealed('00000');
    const leaderId = new Types.ObjectId();
    const channelId = new Types.ObjectId();
    await model.updateOne(
      { title: MORNING },
      {
        $set: {
          zoomLink: link,
          zoomPassword: password,
          leaderId,
          channelIds: [channelId],
        },
      },
    );
    const before = await model.findOne({ title: MORNING }).lean<LeanClass>();

    const classes = await migrate();

    const grown = slotAt(classes, 1, '08:00');
    expect(grown.title).toBe('Нейгун и тайцзицюань');
    expect(String(grown._id)).toBe(String(before?._id));
    expect(grown.zoomLink).toBe(link);
    expect(grown.zoomPassword).toBe(password);
    expect(String(grown.leaderId)).toBe(String(leaderId));
    expect(grown.channelIds.map(String)).toEqual([String(channelId)]);
    const keptIds = (before?.rules ?? [])
      .filter((rule) => rule.weekday !== 4)
      .map((rule) => String(rule._id));
    expect(grown.rules.map((rule) => String(rule._id))).toEqual(keptIds);
  });

  // Чт 08:00 раньше было частью утреннего слота, Пт 09:00 сидит в той же комнате
  // по присланному списку. Ссылка у обоих — копия строки из базы.
  it('новые слоты из комнаты Вт 08:00 получают копию её ссылки и пароля', async () => {
    const link = sealed('https://zoom.example/j/000');
    const password = sealed('00000');
    await model.updateOne(
      { title: MORNING },
      { $set: { zoomLink: link, zoomPassword: password } },
    );

    const classes = await migrate();

    for (const [weekday, time] of [
      [4, '08:00'],
      [5, '09:00'],
    ] as const) {
      const copy = slotAt(classes, weekday, time);
      expect(copy.zoomLink).toBe(link);
      expect(copy.zoomPassword).toBe(password);
    }
    expect(slotAt(classes, 4, '08:00').title).toBe('Тайцзицюань');
    expect(slotAt(classes, 4, '08:00').groupLabel).toBe('младшая группа');
  });

  it('Пт 18:30 берёт ссылку Ср 18:30, а у Вт 20:00 ссылки нет', async () => {
    const link = sealed('https://zoom.example/j/111');
    await model.updateOne(
      { title: 'Цзибеньгун', groupLabel: '' },
      { $set: { zoomLink: link } },
    );
    const before = await model
      .findOne({ title: 'Цзибеньгун', groupLabel: '' })
      .lean<LeanClass>();
    const wednesdayRule = before?.rules.find((rule) => rule.weekday === 3);

    const classes = await migrate();

    const wednesday = slotAt(classes, 3, '18:30');
    expect(wednesday.zoomLink).toBe(link);
    expect(String(wednesday.rules[0]?._id)).toBe(String(wednesdayRule?._id));
    expect(slotAt(classes, 5, '18:30').zoomLink).toBe(link);
    expect(slotAt(classes, 5, '18:30').zoomPassword).toBeUndefined();
    expect(slotAt(classes, 2, '20:00').zoomLink).toBeUndefined();
  });

  it('Основы Дхармы: длительность 90 → 60, а правило и ссылка те же', async () => {
    const link = sealed('https://zoom.example/j/222');
    await model.updateOne({ title: 'Основы Дхармы' }, { $set: { zoomLink: link } });
    const before = await model.findOne({ title: 'Основы Дхармы' }).lean<LeanClass>();

    const classes = await migrate();

    const dharma = slotAt(classes, 5, '12:00');
    expect(dharma.rules.map((rule) => rule.durationMin)).toEqual([60]);
    expect(String(dharma.rules[0]?._id)).toBe(String(before?.rules[0]?._id));
    expect(dharma.zoomLink).toBe(link);
  });

  it('идемпотентна: второй прогон не меняет ни одного документа', async () => {
    await model.updateOne(
      { title: MORNING },
      { $set: { zoomLink: sealed('https://zoom.example/j/000') } },
    );
    const first = await migrate();

    const second = await migrate();

    expect(second).toHaveLength(EXPECTED_CLASSES);
    // JSON выравнивает ObjectId и даты до строк: сравнение целых документов.
    expect(JSON.parse(JSON.stringify(second))).toEqual(JSON.parse(JSON.stringify(first)));
  });

  // Учитель поменял время — это важнее таблицы: слот остаётся как был, и новый
  // слот на его прежний момент не заводится.
  it('слот, который учитель тронул, не переименовывает и не заменяет новым', async () => {
    await model.updateOne(
      { title: 'Основы Дхармы' },
      { $set: { 'rules.0.time': '12:30' } },
    );
    const before = await model.findOne({ title: 'Основы Дхармы' }).lean<LeanClass>();

    const classes = await migrate();

    const after = classes.find((cls) => cls.title === 'Основы Дхармы');
    expect(JSON.parse(JSON.stringify(after))).toEqual(JSON.parse(JSON.stringify(before)));
    expect(
      classes.filter((cls) => cls.rules.some((r) => r.time === '12:00')),
    ).toHaveLength(0);
    expect(classes).toHaveLength(EXPECTED_CLASSES);
  });

  it('момент, который учитель занял своим занятием, не дублируется', async () => {
    await model.create({
      title: 'Своё занятие',
      format: 'offline',
      rules: [{ weekday: 1, time: '19:00', durationMin: 45 }],
    });

    const classes = await migrate();

    expect(slotAt(classes, 1, '19:00').title).toBe('Своё занятие');
    const novices = classes.find((cls) => cls.groupLabel === 'новички');
    expect(novices && ruleKeys(novices)).toEqual(['2 19:00 60', '3 19:00 60']);
    expect(classes).toHaveLength(EXPECTED_CLASSES + 1);
  });

  it('выключенное занятие тоже занимает момент', async () => {
    await model.create({
      title: 'Старое занятие',
      format: 'offline',
      active: false,
      rules: [{ weekday: 1, time: '20:00', durationMin: 60 }],
    });

    const classes = await migrate();

    expect(slotAt(classes, 1, '20:00').title).toBe('Старое занятие');
    expect(classes.some((cls) => cls.title === 'Парная работа в илицюань')).toBe(false);
  });

  it('новые слоты получают активные каналы рассылки, но не личные и не выключенные', async () => {
    const channel = (overrides: Partial<ChannelRecord> = {}) =>
      channelModel.create({ type: 'telegram', title: 'Чат', config: '{}', ...overrides });
    const school = await channel();
    await channel({ broadcastEligible: false });
    await channel({ active: false });

    const classes = await migrate();

    const created = slotAt(classes, 4, '20:00');
    expect(created.channelIds.map(String)).toEqual([String(school._id)]);
  });

  // Документ без поля rules бывает только заведённым руками мимо схемы. Миграция
  // идёт до `listen`, и её падение не дало бы приложению стартовать.
  it('документ без правил не роняет миграцию и остаётся как был', async () => {
    const { insertedId } = await db()
      .collection('classes')
      .insertOne({ title: 'Черновик без правил', groupLabel: '' });

    const classes = await migrate();

    expect(classes).toHaveLength(EXPECTED_CLASSES + 1);
    const draft = await db().collection('classes').findOne({ _id: insertedId });
    expect(draft).toEqual({
      _id: insertedId,
      title: 'Черновик без правил',
      groupLabel: '',
    });
  });
});

describe('0019: разбор таблицы и правила слота', () => {
  it('запись без длительности — час, с длительностью — сколько указано', () => {
    expect(parseRule('Вс 08:00')).toEqual({ weekday: 0, time: '08:00', durationMin: 60 });
    expect(parseRule('Пт 10:30 (30)')).toEqual({
      weekday: 5,
      time: '10:30',
      durationMin: 30,
    });
  });

  // Опечатка в таблице должна уронить тесты, а не молча завести слот в
  // воскресенье или без времени.
  it.each(['Xx 08:00', 'Вс', 'Вс 8 утра'])('кривая запись «%s» — ошибка', (text) => {
    expect(() => parseRule(text)).toThrow(text);
  });

  it('правило с прежним моментом сохраняет _id, новый момент получает новый', () => {
    const kept = new Types.ObjectId();
    const rules = growRules(
      [{ _id: kept, weekday: 1, time: '08:00', durationMin: 60 }],
      [
        { weekday: 1, time: '08:00', durationMin: 90 },
        { weekday: 2, time: '08:00', durationMin: 60 },
      ],
    );

    expect(String(rules[0]?._id)).toBe(String(kept));
    expect(rules[0]?.durationMin).toBe(90);
    expect(rules[1]?._id).toBeInstanceOf(Types.ObjectId);
    expect(String(rules[1]?._id)).not.toBe(String(kept));
  });
});
