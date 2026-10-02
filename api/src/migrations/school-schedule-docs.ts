// Общие кирпичи миграций полного расписания школы — 0019 и 0022 пишут одни и
// те же сырые документы `classes`, и копия этих функций в каждой разъехалась
// бы при первой правке (CLAUDE.md «Дубли», jscpd). Миграции идут мимо схемы
// Mongoose, поэтому умолчания схемы выписаны здесь явно.
import { mongo } from 'mongoose';
import {
  DEFAULT_LEAD_MINUTES,
  SCHOOL_TZ,
  type ClassFormat,
  type Weekday,
} from '@xuanxue/shared';

// `mongo` — тот же драйвер, что внутри mongoose, поэтому типы совпадают (см. 0001).
const { ObjectId } = mongo;
type Db = mongo.Db;
type Id = mongo.ObjectId;

const CHANNELS = 'channels';

export interface SeedRule {
  weekday: Weekday;
  time: string;
  durationMin: number;
}

export type StoredRule = SeedRule & { _id: Id };

/** Сырой документ `classes`: только поля, которые миграции читают. */
export interface ClassDoc extends mongo.Document {
  _id: Id;
  title: string;
  groupLabel?: string;
  format?: string;
  location?: string;
  zoomLink?: string;
  zoomPassword?: string;
  active?: boolean;
  rules?: StoredRule[];
}

export type Classes = mongo.Collection<ClassDoc>;

/** Слот так, как его описывает таблица владельца. */
export interface SlotShape {
  title: string;
  groupLabel: string;
  format: ClassFormat;
  /** `null` — зала нет, `location` в документ не пишется. */
  location: string | null;
}

/** Момент занятия в неделе — день и время; в таблице владельца он у каждого
 * занятия свой. */
export const momentOf = (rule: Pick<SeedRule, 'weekday' | 'time'>): string =>
  `${rule.weekday} ${rule.time}`;

// Документ без правил — только заведённый руками мимо схемы: слот без моментов,
// а не повод уронить старт приложения.
export const rulesOf = (doc: Pick<ClassDoc, 'rules'>): StoredRule[] => doc.rules ?? [];

/** Тот же отбор, что `ClassesService.defaultTelegramChannelIds`: личный канал
 * ученика (`broadcastEligible: false`, ADR-0027) получателем занятия не бывает. */
export async function readBroadcastChannelIds(db: Db): Promise<Id[]> {
  const channels = await db
    .collection(CHANNELS)
    .find(
      { type: 'telegram', active: true, broadcastEligible: { $ne: false } },
      { projection: { _id: 1 } },
    )
    .toArray();
  return channels.map((channel) => channel._id);
}

/** Ссылка и пароль слота из той же комнаты Zoom — копией, как лежат в базе,
 * зашифрованными: миграция их не расшифровывает. */
export async function readZoomOf(
  classes: Classes,
  { weekday, time }: Pick<SeedRule, 'weekday' | 'time'>,
): Promise<{ zoomLink?: string; zoomPassword?: string }> {
  const source = await classes.findOne({
    rules: { $elemMatch: { weekday, time } },
    zoomLink: { $type: 'string', $ne: '' },
  });
  if (!source?.zoomLink) return {};
  const { zoomLink, zoomPassword } = source;
  return zoomPassword ? { zoomLink, zoomPassword } : { zoomLink };
}

interface NewSlotInput {
  slot: SlotShape;
  rules: readonly SeedRule[];
  channelIds: Id[];
  zoom: { zoomLink?: string; zoomPassword?: string };
  now: Date;
}

/** Новый слот сырым документом со всеми умолчаниями схемы. */
export function newSlotDocument({ slot, rules, channelIds, zoom, now }: NewSlotInput) {
  return {
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
  };
}
