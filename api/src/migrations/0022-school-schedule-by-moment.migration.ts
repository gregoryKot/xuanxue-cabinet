// Полное расписание (0019) — по моменту занятия, а не по сверке с сентябрём.
//
// 0019 переименовывала слот 0001, только если его правила совпадали с теми,
// что завела 0001. На проде слот «Цзибеньгун» (Ср и Пт 18:30) правили в
// кабинете — 0019 молча его пропустила, а «Тайцзицюань · все группы» на
// Пт 18:30 не завела, потому что момент был занят. Владелец увидел
// «Цзибеньгун» в пятнице сам (2026-10-02, ADR-0166, дополнение).
//
// Здесь ключ — момент недели (день, время): в таблице владельца он у каждого
// занятия свой. Для каждого слота таблицы:
// - «дом» — документ, у которого больше всего моментов слота (при равенстве —
//   включённый, затем первый по порядку правил). Дом получает название, группу,
//   формат и место из таблицы; правила — моменты слота плюс моменты вне таблицы
//   (учитель мог добавить своё), а моменты других слотов таблицы уходят к ним;
// - моменты слота из других документов переезжают в дом; документ, у которого
//   так не осталось правил, выключается (не удаляется: на него ссылаются даты
//   и записи занятий);
// - нет ни одного документа — слот заводится новым, как в 0019.
// Время и длительность уже существующих правил не трогаем — их могли поправить
// в кабинете; длительность из таблицы получает только новое правило. Ссылку,
// каналы, ведущего и выключатель дома не трогаем; ссылки нет — копируем из
// той же комнаты Zoom (sameZoomAs), как 0019.
//
// К таблице 0019 добавлено занятие, о котором владелец сказал после неё:
// веер для начинающих по пятницам 19:30–20:00 в комнате пятницы 18:30.
//
// Миграция возвращает отчёт строками, раннер пишет его в лог Railway.
import { mongo } from 'mongoose';
import {
  parseRule,
  SCHEDULE,
  type ScheduleSlot,
} from './0019-full-school-schedule.migration';
import {
  momentOf,
  newSlotDocument,
  readBroadcastChannelIds,
  readZoomOf,
  rulesOf,
  type ClassDoc,
  type Classes,
  type StoredRule,
} from './school-schedule-docs';

const { ObjectId } = mongo;
type Db = mongo.Db;

const CLASSES = 'classes';

/** Неделя школы: таблица 0019 и занятия, добавленные владельцем после неё. */
export const FULL_WEEK: readonly ScheduleSlot[] = [
  ...SCHEDULE,
  {
    title: 'Занятие с веером тайцзи',
    groupLabel: 'начинающие',
    format: 'online',
    location: null,
    rules: [parseRule('Пт 19:30 (30)')],
    grownFrom: undefined,
    sameZoomAs: parseRule('Пт 18:30'),
  },
];

const TABLE_MOMENTS = new Set(FULL_WEEK.flatMap((slot) => slot.rules.map(momentOf)));
const nameOf = (doc: { title: string; groupLabel?: string }): string =>
  doc.groupLabel ? `«${doc.title} · ${doc.groupLabel}»` : `«${doc.title}»`;

/** Дом слота: больше моментов слота, затем включённый, затем раньше по правилам
 * слота (в слоте не больше трёх правил, поэтому разряды не пересекаются). */
function pickHome(holders: ClassDoc[], slot: ScheduleSlot): ClassDoc | undefined {
  const wanted = slot.rules.map(momentOf);
  const rank = (doc: ClassDoc): number => {
    const own = rulesOf(doc).map(momentOf);
    const count = own.filter((moment) => wanted.includes(moment)).length;
    const first = wanted.findIndex((moment) => own.includes(moment));
    return count * 1000 + (doc.active === false ? 0 : 100) - first;
  };
  return [...holders].sort((a, b) => rank(b) - rank(a))[0];
}

/** Правила дома: свои моменты слота и моменты вне таблицы остаются как есть,
 * недостающие моменты слота добавляются; длительность — переезжающего правила
 * (`moving`), если оно было, иначе из таблицы. */
function homeRules(
  home: ClassDoc,
  slot: ScheduleSlot,
  moving: ReadonlyMap<string, StoredRule>,
): StoredRule[] {
  const wanted = new Set(slot.rules.map(momentOf));
  const kept = rulesOf(home).filter((rule) => {
    const moment = momentOf(rule);
    return wanted.has(moment) || !TABLE_MOMENTS.has(moment);
  });
  const have = new Set(kept.map(momentOf));
  const added = slot.rules
    .filter((rule) => !have.has(momentOf(rule)))
    .map((rule) => ({
      _id: new ObjectId(),
      ...rule,
      durationMin: moving.get(momentOf(rule))?.durationMin ?? rule.durationMin,
    }));
  return [...kept, ...added];
}

const ruleIds = (rules: StoredRule[]): string => rules.map((r) => String(r._id)).join();

async function convergeSlot(db: Db, slot: ScheduleSlot, now: Date): Promise<string[]> {
  const classes: Classes = db.collection<ClassDoc>(CLASSES);
  const wanted = new Set(slot.rules.map(momentOf));
  const docs = await classes.find({}).toArray();
  const holders = docs.filter((doc) => rulesOf(doc).some((r) => wanted.has(momentOf(r))));
  const home = pickHome(holders, slot);
  if (!home) {
    const zoom = slot.sameZoomAs ? await readZoomOf(classes, slot.sameZoomAs) : {};
    const channelIds = await readBroadcastChannelIds(db);
    await classes.insertOne(
      newSlotDocument({ slot, rules: slot.rules, channelIds, zoom, now }),
    );
    return [`заведено ${nameOf(slot)}`];
  }

  const others = holders.filter((doc) => doc !== home);
  const moving = new Map(
    others
      .flatMap(rulesOf)
      .filter((rule) => wanted.has(momentOf(rule)))
      .map((rule) => [momentOf(rule), rule] as const),
  );
  const report: string[] = [];
  for (const other of others) {
    const left = rulesOf(other).filter((rule) => !wanted.has(momentOf(rule)));
    await classes.updateOne(
      { _id: other._id },
      { $set: { rules: left, updatedAt: now } },
    );
    report.push(`из ${nameOf(other)} перенесено в ${nameOf(slot)}`);
  }

  const rules = homeRules(home, slot, moving);
  const location = slot.location ?? home.location;
  const zoom =
    !home.zoomLink && slot.sameZoomAs ? await readZoomOf(classes, slot.sameZoomAs) : {};
  const unchanged =
    home.title === slot.title &&
    home.groupLabel === slot.groupLabel &&
    home.format === slot.format &&
    home.location === location &&
    ruleIds(rulesOf(home)) === ruleIds(rules) &&
    !('zoomLink' in zoom);
  if (unchanged) return report;

  await classes.updateOne(
    { _id: home._id },
    {
      $set: {
        title: slot.title,
        groupLabel: slot.groupLabel,
        format: slot.format,
        rules,
        ...(location === undefined ? {} : { location }),
        ...zoom,
        updatedAt: now,
      },
    },
  );
  return [...report, `${nameOf(home)} → ${nameOf(slot)}`];
}

export const scheduleByMoment = {
  id: '0022-school-schedule-by-moment',
  async up(db: Db): Promise<string[]> {
    const classes = db.collection<ClassDoc>(CLASSES);
    const now = new Date();
    const hadRules = await classes.find({ 'rules.0': { $exists: true } }).toArray();

    const report: string[] = [];
    for (const slot of FULL_WEEK) report.push(...(await convergeSlot(db, slot, now)));

    // Опустевшие нашими руками — выключаем; пустые и раньше не трогаем.
    for (const doc of hadRules) {
      const { modifiedCount } = await classes.updateOne(
        { _id: doc._id, rules: { $size: 0 }, active: { $ne: false } },
        { $set: { active: false, updatedAt: now } },
      );
      if (modifiedCount > 0) report.push(`выключено опустевшее ${nameOf(doc)}`);
    }
    return report;
  },
};
