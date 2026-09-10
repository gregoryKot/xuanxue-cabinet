// Миграция пишет сырыми документами через драйвер, минуя схему Mongoose, —
// поэтому проверяем именно read-after-write: записали драйвером → прочитали
// моделью и увидели готовый класс, а не документ с дырами вместо значений по
// умолчанию (CLAUDE.md «Тесты», уровень «запросы к базе»).
import type { Connection, Model } from 'mongoose';
import { DEFAULT_LEAD_MINUTES, SCHOOL_TZ } from '@xuanxue/shared';
import { seedSchoolClasses } from './0001-school-classes.migration';
import { ClassRecord, type LeanScheduleRule } from '../classes/class.schema';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';

// `.lean()` отдаёт правила как ScheduleRule — публичный контракт без `_id`
// (class.schema.ts): для проверки самого `_id` берём форму хранения.
interface LeanClass {
  rules: LeanScheduleRule[];
}

const EXPECTED_CLASSES = 11;
const EXPECTED_RULES = 16;

describe('Миграция 0001-school-classes', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let model: Model<ClassRecord>;

  function db(): NonNullable<Connection['db']> {
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
    await model.deleteMany({});
  });

  it('создаёт расписание школы: слоты читаются моделью со всеми умолчаниями', async () => {
    await seedSchoolClasses.up(db());

    const classes = await model.find().lean();
    expect(classes).toHaveLength(EXPECTED_CLASSES);
    expect(classes.reduce((sum, cls) => sum + cls.rules.length, 0)).toBe(EXPECTED_RULES);

    const morning = classes.find(
      (cls) => cls.title === 'Утреннее занятие школы Сюань-Сюэ',
    );
    expect(morning).toBeDefined();
    expect(morning?.tz).toBe(SCHOOL_TZ);
    expect(morning?.leadMinutes).toBe(DEFAULT_LEAD_MINUTES);
    expect(morning?.active).toBe(true);
    expect(morning?.format).toBe('online');
    expect(morning?.channelIds).toEqual([]);
    expect(morning?.rules.map((rule) => rule.weekday)).toEqual([1, 2, 4]);
  });

  // Ссылки и пароли Zoom в репозиторий не кладутся (SECURITY.md): миграция
  // создаёт слот пустым, ссылку вписывает учитель на экране «Занятия».
  it('не приносит ссылок Zoom', async () => {
    await seedSchoolClasses.up(db());

    const classes = await model.find().lean();
    expect(classes.every((cls) => !cls.zoomLink && !cls.zoomPassword)).toBe(true);
  });

  // У правила свой `_id`: планировщик ссылается на него из `lessons.ruleId`,
  // и без него занятие не привязать к правилу расписания.
  it('даёт каждому правилу свой _id', async () => {
    await seedSchoolClasses.up(db());

    const classes = await model.find().lean<LeanClass[]>();
    const ids = classes.flatMap((cls) => cls.rules.map((rule) => String(rule._id)));
    expect(ids).toHaveLength(EXPECTED_RULES);
    expect(new Set(ids).size).toBe(EXPECTED_RULES);
  });

  it('идемпотентна: второй прогон не дублирует слоты', async () => {
    await seedSchoolClasses.up(db());
    await seedSchoolClasses.up(db());

    expect(await model.countDocuments()).toBe(EXPECTED_CLASSES);
  });

  // Занятие могли завести руками или импортом до деплоя — миграция обязана
  // оставить его как есть, вместе с уже вписанной ссылкой.
  it('не трогает слот, который уже завели с той же парой (title, groupLabel)', async () => {
    await model.create({
      title: 'Цигун для глаз',
      groupLabel: '',
      format: 'online',
      zoomLink: 'https://zoom.example/existing',
      rules: [{ weekday: 0, time: '09:00', durationMin: 45 }],
    });

    await seedSchoolClasses.up(db());

    const existing = await model.find({ title: 'Цигун для глаз' }).lean();
    expect(existing).toHaveLength(1);
    expect(existing[0]?.zoomLink).toBe('https://zoom.example/existing');
    expect(existing[0]?.rules[0]?.time).toBe('09:00');
    expect(await model.countDocuments()).toBe(EXPECTED_CLASSES);
  });
});
