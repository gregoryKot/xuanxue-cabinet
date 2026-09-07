// Запросы планировщика рассылок на чтение — классы, занятия «в окне», активные
// каналы класса. Запись (insert рассылки/доставок, cancelled-плейсхолдер) —
// broadcast-planner.inserts.ts: разделено ради лимита файла (CLAUDE.md
// «Храповики», 150 строк).
import type { DateTime } from 'luxon';
import type { Model, Types } from 'mongoose';
import {
  DEFAULT_LEAD_MINUTES,
  type ClassFormat,
  type LessonStatus,
} from '@xuanxue/shared';
import type { ChannelRecord } from '../channels/channel.schema';
import type { ClassRecord } from '../classes/class.schema';
import type { LessonRecord } from '../lessons/lesson.schema';

export interface PlannerClass {
  _id: Types.ObjectId;
  title: string;
  groupLabel: string;
  format: ClassFormat;
  zoomLink?: string;
  zoomPassword?: string;
  tz: string;
  channelIds: Types.ObjectId[];
  leadMinutes: number;
  active: boolean;
  leaderId?: Types.ObjectId;
}

const CLASS_PROJECTION = {
  title: 1,
  groupLabel: 1,
  format: 1,
  zoomLink: 1,
  zoomPassword: 1,
  tz: 1,
  channelIds: 1,
  leadMinutes: 1,
  active: 1,
  leaderId: 1,
} as const;

export interface PlannerLesson {
  _id: Types.ObjectId;
  classId: Types.ObjectId;
  topic: string;
  status: LessonStatus;
  startsAt: Date;
  durationMin: number;
  zoomLinkOverride?: string;
  zoomPasswordOverride?: string;
  leaderId?: Types.ObjectId;
}

const LESSON_PROJECTION = {
  classId: 1,
  topic: 1,
  status: 1,
  startsAt: 1,
  durationMin: 1,
  zoomLinkOverride: 1,
  zoomPasswordOverride: 1,
  leaderId: 1,
} as const;

export function findClasses(classModel: Model<ClassRecord>): Promise<PlannerClass[]> {
  return classModel.find({}, CLASS_PROJECTION).lean<PlannerClass[]>();
}

// Запас ниже DEFAULT_LEAD_MINUTES для нижней границы запроса: decideBroadcast
// сам считает занятие непоправимо опоздавшим ровно в момент
// `now - DEFAULT_LEAD_MINUTES`, и если нижняя граница выборки стоит на том же
// пороге, узкий тик (сервис был недоступен и вернулся спустя минуту-другую
// после порога) вообще не увидит такое занятие — cancelled-плейсхолдер и
// error в лог для него никогда не появятся, а это и есть тихий отказ, от
// которого предупреждает RUNBOOK §8.1. Двойной запас даёт too_late реальное
// окно — занятие остаётся видимым выборке ещё DEFAULT_LEAD_MINUTES минут
// после порога, этого достаточно, чтобы тик после короткого простоя всё
// равно поймал его и записал причину один раз.
const DUE_LOOKBACK_MINUTES = DEFAULT_LEAD_MINUTES * 2;

/**
 * Кандидаты «уже пора, скоро пора или недавно непоправимо опоздали».
 * Нижняя граница держит окно конечным — без неё выборка тянула бы вообще все
 * `scheduled`-занятия из истории школы на каждом тике (занятие без broadcast
 * статус не меняет само по себе, и в базе оно осталось бы `scheduled`
 * навсегда). Верхнюю границу считаем по максимальному `leadMinutes` среди
 * классов (`send` дальше отсеет то, что рано для своего класса); финальное
 * решение по каждому занятию — decideBroadcast.
 */
export function findDueLessons(
  lessonModel: Model<LessonRecord>,
  classes: readonly PlannerClass[],
  now: DateTime,
): Promise<PlannerLesson[]> {
  const maxLeadMinutes = classes.reduce(
    (max, cls) => Math.max(max, cls.leadMinutes),
    DEFAULT_LEAD_MINUTES,
  );
  return lessonModel
    .find(
      {
        status: 'scheduled',
        startsAt: {
          $gt: now.minus({ minutes: DUE_LOOKBACK_MINUTES }).toJSDate(),
          $lte: now.plus({ minutes: maxLeadMinutes }).toJSDate(),
        },
      },
      LESSON_PROJECTION,
    )
    .lean<PlannerLesson[]>();
}

/** Один класс по id — для рассылки записи (RecordingBroadcastService,
 * broadcasts/recording-broadcast.service.ts): своя функция, не findClasses(),
 * которая тянет школу целиком ради тика планировщика. Та же проекция —
 * recordingValues (post-renderer.ts) не смотрит на zoomLink/leadMinutes, но
 * RenderClassInput требует их в типе, как и lessonLinkValues. */
export function findClassForRecording(
  classModel: Model<ClassRecord>,
  classId: Types.ObjectId,
): Promise<PlannerClass | null> {
  return classModel.findById(classId, CLASS_PROJECTION).lean<PlannerClass | null>();
}

/** Активные каналы класса на момент отправки (CLAUDE.md «Только активные
 * каналы»): пустой результат — сигнал сервису для cancelled-плейсхолдера, не
 * ошибка. */
export function findActiveChannelIds(
  channelModel: Model<ChannelRecord>,
  channelIds: readonly Types.ObjectId[],
): Promise<Types.ObjectId[]> {
  return channelModel
    .find({ _id: { $in: channelIds }, active: true }, { _id: 1 })
    .lean<{ _id: Types.ObjectId }[]>()
    .then((docs) => docs.map((doc) => doc._id));
}
