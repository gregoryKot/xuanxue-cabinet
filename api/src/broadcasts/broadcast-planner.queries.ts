// Запросы планировщика рассылок на чтение — классы, занятия «в окне».
// Запись (insert рассылки/доставок, cancelled-плейсхолдер) —
// broadcast-planner.inserts.ts; отбор каналов по активности и тегу —
// broadcast-channels.queries.ts: разделено ради лимита файла (CLAUDE.md
// «Храповики», 150 строк).
import type { DateTime } from 'luxon';
import type { Model, Types } from 'mongoose';
import {
  DEFAULT_LEAD_MINUTES,
  LIST_LIMIT_MAX,
  type ClassFormat,
  type LessonStatus,
} from '@xuanxue/shared';
import { CLASS_ENCRYPT_SCHEMA, type ClassRecord } from '../classes/class.schema';
import { LESSON_ENCRYPT_SCHEMA, type LessonRecord } from '../lessons/lesson.schema';
import { decryptRecord } from '../utils/encryption';

// type, не interface: decryptRecord требует индексную сигнатуру (как LeanLesson).
// `tags` — честно опционален: у класса, заведённого до ADR-0072, поля в
// документе нет, `.lean()` не подставляет default при чтении (тот же приём,
// что у LeanClass/class.mapper.ts).
export type PlannerClass = {
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
  tags?: string[];
};

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
  tags: 1,
} as const;

// `tags` — та же оговорка, что у PlannerClass выше (запись до ADR-0075).
export type PlannerLesson = {
  _id: Types.ObjectId;
  classId: Types.ObjectId;
  topic: string;
  status: LessonStatus;
  startsAt: Date;
  durationMin: number;
  zoomLinkOverride?: string;
  zoomPasswordOverride?: string;
  leaderId?: Types.ObjectId;
  tags?: string[];
};

const LESSON_PROJECTION = {
  classId: 1,
  topic: 1,
  status: 1,
  startsAt: 1,
  durationMin: 1,
  zoomLinkOverride: 1,
  zoomPasswordOverride: 1,
  leaderId: 1,
  tags: 1,
} as const;

// Ссылка и пароль класса лежат шифротекстом (CLASS_FIELD_POLICY): без
// decryptRecord в пост ушёл бы base64 вместо ссылки Zoom. `.limit(LIST_LIMIT_MAX)`
// — «дай всё» запрещено даже тику планировщика (CLAUDE.md «API»).
export async function findClasses(
  classModel: Model<ClassRecord>,
): Promise<PlannerClass[]> {
  const docs = await classModel
    .find({}, CLASS_PROJECTION)
    .limit(LIST_LIMIT_MAX)
    .lean<PlannerClass[]>();
  return docs.map((doc) => decryptRecord(doc, CLASS_ENCRYPT_SCHEMA));
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
 * статус не меняет само по себе, и осталось бы `scheduled` навсегда).
 * Верхнюю границу считаем по максимальному `leadMinutes` среди классов плюс
 * `previewMinutes` (настройка школы из `SettingsService.get()`) — тем же
 * запасом, что в decideBroadcast (окно расширено, чтобы broadcast появился
 * заранее для предпросмотра бота, PLAN.md §6): без запаса здесь Mongo-запрос
 * отсекал бы занятие ещё до decideBroadcast, и «в расширенном окне» оттуда
 * было бы недостижимо. `send` дальше отсеет то, что рано для своего класса —
 * финальное решение по каждому занятию — decideBroadcast.
 */
export async function findDueLessons(
  lessonModel: Model<LessonRecord>,
  classes: readonly PlannerClass[],
  now: DateTime,
  previewMinutes: number,
): Promise<PlannerLesson[]> {
  const maxLeadMinutes = classes.reduce(
    (max, cls) => Math.max(max, cls.leadMinutes),
    DEFAULT_LEAD_MINUTES,
  );
  const docs = await lessonModel
    .find(
      {
        status: 'scheduled',
        startsAt: {
          $gt: now.minus({ minutes: DUE_LOOKBACK_MINUTES }).toJSDate(),
          $lte: now.plus({ minutes: maxLeadMinutes + previewMinutes }).toJSDate(),
        },
      },
      LESSON_PROJECTION,
    )
    .lean<PlannerLesson[]>();
  // Разовая ссылка занятия тоже зашифрована (LESSON_FIELD_POLICY).
  return docs.map((doc) => decryptRecord(doc, LESSON_ENCRYPT_SCHEMA));
}

/** Один класс по id — для рассылки записи (RecordingBroadcastService,
 * broadcasts/recording-broadcast.service.ts): своя функция, не findClasses(),
 * которая тянет школу целиком ради тика планировщика. Та же проекция —
 * recordingValues (post-renderer.ts) не смотрит на zoomLink/leadMinutes, но
 * RenderClassInput требует их в типе, как и lessonLinkValues. */
export async function findClassForRecording(
  classModel: Model<ClassRecord>,
  classId: Types.ObjectId,
): Promise<PlannerClass | null> {
  const doc = await classModel
    .findById(classId, CLASS_PROJECTION)
    .lean<PlannerClass | null>();
  return doc === null ? null : decryptRecord(doc, CLASS_ENCRYPT_SCHEMA);
}
