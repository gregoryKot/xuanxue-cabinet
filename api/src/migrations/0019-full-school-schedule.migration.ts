// Полное расписание школы: 30 занятий в неделю в 24 слотах, с парками, залом на
// Аркави и онлайн. 0001 принесла только онлайн-часть (11 слотов, 16 занятий);
// 2026-10-02 владелец прислал полный список. Руками это 13 новых слотов и 11
// правок старых — работа, от которой он уже отказывался (ADR-0019, дополнение
// 2026-09-10). Что выбрано и где источники расходятся — ADR-0166.
//
// 1. Переименовываются только нетронутые слоты 0001 — те, чей набор правил
// (день, время, длительность) совпадает с созданным 0001: время, поменянное
// учителем в кабинете, важнее нашей таблицы. Тронутый слот пропускается
// целиком, и на его прежний момент новый не заводится. Ссылку, каналы,
// ведущего, active и теги не трогаем. Тёзок по (title, groupLabel) после
// первого прогона два, поэтому слот выбирается по совпавшим правилам — это же
// держит идемпотентность.
//
// 2. Новые слоты заводятся по моменту (weekday, time), а не по (title,
// groupLabel): «Тайцзицюань / младшая группа» во Вт 20:00 и Чт 08:00 — тёзки с
// разными комнатами Zoom. Момент, занятый правилом любого слота (учитель мог
// завести его сам), пропускается.
//
// 3. Ссылка Zoom копируется только внутри одной комнаты: Пт 09:00 и Чт 08:00 —
// комната Вт 08:00, Пт 18:30 — комната Ср 18:30. Строки переносятся как есть,
// зашифрованными. У Вт 20:00 комнаты нет — ссылку впишет учитель. Самих ссылок
// в файле нет: репозиторий публичный (SECURITY.md).
//
// Сырые документы через драйвер, как в 0001: умолчания схемы выписаны явно.
import { mongo } from 'mongoose';
import {
  DEFAULT_LEAD_MINUTES,
  SCHOOL_TZ,
  WEEKDAYS,
  type ClassFormat,
  type Weekday,
} from '@xuanxue/shared';

// `mongo` — тот же драйвер, что внутри mongoose, поэтому типы совпадают (см. 0001).
const { ObjectId } = mongo;
type Db = mongo.Db;
type Id = mongo.ObjectId;

const CLASSES = 'classes';
const CHANNELS = 'channels';

const DEFAULT_DURATION_MIN = 60;
// Порядок как у WEEKDAYS: 0 — воскресенье … 6 — суббота.
const DAY_LABELS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
// «Вт 18:30» или «Пт 09:00 (90)» — запись из таблицы владельца.
const RULE_RE = /^(\S{2}) (\d{2}:\d{2})(?: \((\d+)\))?$/;

const GONDA = 'Парк Гонда, Тель-Авив';
const WOLFSON = 'Парк Вольфсон, Тель-Авив';
const ARKAVI = 'Аркави 3, Тель-Авив';
const ONLINE = null; // зала нет, `location` в документ не пишется

interface SeedRule {
  weekday: Weekday;
  time: string;
  durationMin: number;
}

/** Слот так, как его создала 0001: по нему узнаём «свой» слот в базе. */
interface LegacySlot {
  title: string;
  groupLabel: string;
  rules: SeedRule[];
}

interface ScheduleSlot {
  title: string;
  groupLabel: string;
  format: ClassFormat;
  location: string | null;
  rules: SeedRule[];
  /** Есть — слот вырастает из слота 0001, нет — заводится новым. */
  grownFrom: LegacySlot | undefined;
  /** Момент занятия, у которого та же комната Zoom. */
  sameZoomAs: SeedRule | undefined;
}

export function parseRule(text: string): SeedRule {
  const [, day, time, minutes] = RULE_RE.exec(text) ?? [];
  const weekday = WEEKDAYS.find((_, index) => DAY_LABELS[index] === day);
  if (weekday === undefined || !time) throw new Error(`0019: не разобрать «${text}»`);
  return { weekday, time, durationMin: minutes ? Number(minutes) : DEFAULT_DURATION_MIN };
}

const parseRules = (text: string): SeedRule[] => text.split(', ').map(parseRule);

// Таблица владельца, по строке на слот: название, подпись группы, формат, зал,
// правила. Номер строки (комментарий) — ключ таблиц ниже. Длительности — из
// полного расписания сайта; три расхождения со списком ссылок — в ADR-0166.
const ROWS: [string, string, ClassFormat, string | null, string][] = [
  ['Медитация чжи-гуань', '', 'both', ARKAVI, 'Вс 08:00, Ср 08:00'], // 1
  ['Цигун для глаз и массаж туйна', '', 'online', ONLINE, 'Вс 10:00'], // 2
  ['Тайцзицюань', 'продвинутые', 'offline', GONDA, 'Вс 18:30 (90)'], // 3
  ['Тайцзицюань', 'начинающие', 'offline', GONDA, 'Вс 20:00, Чт 18:30 (90)'], // 4
  ['Нейгун и тайцзицюань', '', 'both', WOLFSON, 'Пн 08:00, Вт 08:00'], // 5
  ['Тайцзицюань', 'средняя группа', 'online', ONLINE, 'Пн 10:00, Вт 10:00'], // 6
  ['Тайцзицюань', 'старшая группа', 'online', ONLINE, 'Пн 18:30'], // 7
  ['Тайцзицюань', 'новички', 'offline', GONDA, 'Пн 19:00, Вт 19:00, Ср 19:00'], // 8
  ['Парная работа в илицюань', '', 'offline', GONDA, 'Пн 20:00'], // 9
  ['Занятие с веером тайцзи', '', 'online', ONLINE, 'Вт 18:30 (90)'], // 10
  ['Тайцзицюань', 'младшая группа', 'online', ONLINE, 'Вт 20:00'], // 11
  ['Нейгун', 'старшая группа', 'online', ONLINE, 'Ср 10:00'], // 12
  ['Тайцзицюань', 'средняя группа', 'online', ONLINE, 'Ср 18:30'], // 13
  ['Парная работа тайцзицюань и илицюань', '', 'offline', GONDA, 'Ср 20:00'], // 14
  ['Тайцзицюань', 'младшая группа', 'online', ONLINE, 'Чт 08:00'], // 15
  ['Медитация чжи-гуань', '', 'online', ONLINE, 'Чт 10:00'], // 16
  ['Нейгун', '', 'offline', GONDA, 'Чт 20:00'], // 17
  ['Тайцзицигун', '', 'both', GONDA, 'Пт 09:00 (90)'], // 18
  ['Цигун для глаз', '', 'offline', GONDA, 'Пт 10:30 (30)'], // 19
  ['Основы Дхармы', '', 'online', ONLINE, 'Пт 12:00'], // 20
  ['Тайцзицюань', 'все группы', 'online', ONLINE, 'Пт 18:30'], // 21
  ['Медитация чжи-гуань', 'продвинутые', 'offline', ARKAVI, 'Сб 16:00 (120)'], // 22
  ['Медитация чжи-гуань', 'начинающие', 'both', ARKAVI, 'Сб 18:00 (90)'], // 23
  ['Тайцзицигун', '', 'offline', GONDA, 'Сб 20:00'], // 24
];

// Строки, которые вырастают из слотов 0001 (название, подпись группы, правила
// так, как их создала 0001). Остальные 13 строк — новые слоты.
const GROWN_FROM: Record<number, [string, string, string]> = {
  1: ['Медитация чжи-гуань', '', 'Вс 08:00, Ср 08:00'],
  2: ['Цигун для глаз', '', 'Вс 10:00'],
  5: ['Утреннее занятие школы Сюань-Сюэ', '', 'Пн 08:00, Вт 08:00, Чт 08:00'],
  6: ['Цзибеньгун', 'средняя группа', 'Пн 10:00, Вт 10:00'],
  7: ['Тайцзицюань', '', 'Пн 18:30'],
  10: ['Ицзиньцзин и Бадуаньцзинь', '', 'Вт 18:30'],
  12: ['Тайцзицюань', 'среда', 'Ср 10:00'],
  13: ['Цзибеньгун', '', 'Ср 18:30, Пт 18:30'],
  16: ['Медитация чжи-гуань', 'четверг', 'Чт 10:00'],
  20: ['Основы Дхармы', '', 'Пт 12:00 (90)'],
  23: ['Медитация для начинающих', '', 'Сб 18:00 (120)'],
};

// Новые строки, у которых в присланном списке чужая комната: момент занятия,
// откуда берётся ссылка. У строки 11 комнаты нет вовсе.
const SAME_ZOOM_AS: Record<number, string> = {
  15: 'Вт 08:00',
  18: 'Вт 08:00',
  21: 'Ср 18:30',
};

const SCHEDULE: ScheduleSlot[] = ROWS.map(
  ([title, groupLabel, format, location, rules], index) => {
    const grown = GROWN_FROM[index + 1];
    const zoomMoment = SAME_ZOOM_AS[index + 1];
    return {
      title,
      groupLabel,
      format,
      location,
      rules: parseRules(rules),
      grownFrom: grown && {
        title: grown[0],
        groupLabel: grown[1],
        rules: parseRules(grown[2]),
      },
      sameZoomAs: zoomMoment === undefined ? undefined : parseRule(zoomMoment),
    };
  },
);

/** Сырой документ `classes`: только поля, которые миграция читает. */
interface ClassDoc extends mongo.Document {
  _id: Id;
  title: string;
  groupLabel?: string;
  format?: string;
  location?: string;
  zoomLink?: string;
  zoomPassword?: string;
  rules?: StoredRule[];
}

type Classes = mongo.Collection<ClassDoc>;
type StoredRule = SeedRule & { _id: Id };

// Документ без правил — только заведённый руками мимо схемы: слот без моментов,
// а не повод уронить старт приложения.
const rulesOf = (doc: Pick<ClassDoc, 'rules'>): StoredRule[] => doc.rules ?? [];

const momentOf = (rule: Pick<SeedRule, 'weekday' | 'time'>): string =>
  `${rule.weekday} ${rule.time}`;

/** Наборы правил равны как множества: порядок в документе значения не имеет. */
function isSameRuleSet(have: readonly SeedRule[], want: readonly SeedRule[]): boolean {
  const keyOf = (rule: SeedRule): string => `${momentOf(rule)} ${rule.durationMin}`;
  const left = new Set(have.map(keyOf));
  const right = new Set(want.map(keyOf));
  return left.size === right.size && [...left].every((key) => right.has(key));
}

const isGrown = (doc: ClassDoc, slot: ScheduleSlot): boolean =>
  doc.title === slot.title &&
  doc.groupLabel === slot.groupLabel &&
  doc.format === slot.format &&
  (slot.location === null || doc.location === slot.location) &&
  isSameRuleSet(rulesOf(doc), slot.rules);

/** Правила слота поверх правил слота 0001: правило с прежним моментом
 * сохраняет `_id` — на него ссылается `lessons.ruleId`, и планировщик лишь
 * поправит длительность, а не пересоздаст занятия. */
export function growRules(stored: readonly StoredRule[], wanted: readonly SeedRule[]) {
  const keptIds = new Map(stored.map((rule) => [momentOf(rule), rule._id]));
  return wanted.map((rule) => ({
    _id: keptIds.get(momentOf(rule)) ?? new ObjectId(),
    ...rule,
  }));
}

/** Фаза 1: нетронутый слот 0001 становится слотом полного расписания. */
async function growLegacySlot(classes: Classes, slot: ScheduleSlot, now: Date) {
  const { grownFrom } = slot;
  if (!grownFrom) return;
  const candidates = await classes
    .find({ title: grownFrom.title, groupLabel: grownFrom.groupLabel })
    .toArray();
  const doc = candidates.find((one) => isSameRuleSet(rulesOf(one), grownFrom.rules));
  if (!doc || isGrown(doc, slot)) return;

  await classes.updateOne(
    { _id: doc._id },
    {
      $set: {
        title: slot.title,
        groupLabel: slot.groupLabel,
        format: slot.format,
        rules: growRules(rulesOf(doc), slot.rules),
        updatedAt: now,
        ...(slot.location === null ? {} : { location: slot.location }),
      },
    },
  );
}

/** Тот же отбор, что `ClassesService.defaultTelegramChannelIds`: личный канал
 * ученика (`broadcastEligible: false`, ADR-0027) получателем занятия не бывает. */
async function readBroadcastChannelIds(db: Db): Promise<Id[]> {
  const channels = await db
    .collection(CHANNELS)
    .find(
      { type: 'telegram', active: true, broadcastEligible: { $ne: false } },
      { projection: { _id: 1 } },
    )
    .toArray();
  return channels.map((channel) => channel._id);
}

/** Ссылка и пароль слота из той же комнаты Zoom — копией, как лежат в базе. */
async function readZoomOf(classes: Classes, { weekday, time }: SeedRule) {
  const source = await classes.findOne({
    rules: { $elemMatch: { weekday, time } },
    zoomLink: { $type: 'string', $ne: '' },
  });
  if (!source?.zoomLink) return {};
  const { zoomLink, zoomPassword } = source;
  return zoomPassword ? { zoomLink, zoomPassword } : { zoomLink };
}

/** Фаза 2: новые слоты — на моменты, которые никто не занял. */
async function insertNewSlots(db: Db, classes: Classes, now: Date): Promise<void> {
  const docs = await classes.find({}, { projection: { rules: 1 } }).toArray();
  const taken = new Set(docs.flatMap(rulesOf).map(momentOf));
  const channelIds = await readBroadcastChannelIds(db);

  for (const slot of SCHEDULE.filter((one) => !one.grownFrom)) {
    const rules = slot.rules.filter((rule) => !taken.has(momentOf(rule)));
    if (rules.length === 0) continue;
    rules.forEach((rule) => taken.add(momentOf(rule)));

    const zoom = slot.sameZoomAs ? await readZoomOf(classes, slot.sameZoomAs) : {};
    await classes.insertOne({
      _id: new ObjectId(),
      title: slot.title,
      groupLabel: slot.groupLabel,
      format: slot.format,
      ...(slot.location === null ? {} : { location: slot.location }),
      ...zoom,
      // Правило — субдокумент с собственным `_id`: на него ссылается `lessons.ruleId`.
      rules: rules.map((rule) => ({ _id: new ObjectId(), ...rule })),
      tz: SCHOOL_TZ,
      channelIds,
      leadMinutes: DEFAULT_LEAD_MINUTES,
      active: true,
      tags: [],
      createdAt: now,
      updatedAt: now,
    });
  }
}

export const fullSchoolSchedule = {
  id: '0019-full-school-schedule',
  async up(db: Db): Promise<void> {
    const classes = db.collection<ClassDoc>(CLASSES);
    const now = new Date();

    for (const slot of SCHEDULE) await growLegacySlot(classes, slot, now);
    await insertNewSlots(db, classes, now);
  },
};
