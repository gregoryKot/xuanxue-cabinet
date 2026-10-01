// Выборка тика «Новый материал» (MaterialNewNoticeService, ADR-0162): материалы,
// которые учитель отметил «Сообщить ученикам» за последние сутки, вместе с
// набором занятий, о которых они (material-audience.ts). Окно повторов — общее с
// шагами о занятии (lessons/lesson-notice-queries.ts): «сутки повторов» — свойство
// тика, а не вида.
import type { DateTime } from 'luxon';
import type { Model, Types } from 'mongoose';
import { LIST_LIMIT_MAX } from '@xuanxue/shared';
import type { ClassRecord } from '../classes/class.schema';
import type { LessonRecord } from '../lessons/lesson.schema';
import { noticeWindowStart } from '../lessons/lesson-notice-queries';
import { decryptRecord } from '../utils/encryption';
import { materialAudienceClassIds, type AudienceClass } from './material-audience';
import { MATERIAL_ENCRYPT_SCHEMA, type MaterialRecord } from './material.schema';
import { STUDENT_OPENABLE_FILTER } from './materials.queries';

/** Вид строки ленты, которую пишет этот шаг тика. */
export const MATERIAL_NEW_KIND = 'material_new' as const;

/** Материал, о котором шаг решает, кого известить. */
export interface PlanMaterial {
  id: string;
  /** Название — расшифрованный снимок для строки ленты (`materialTitle`). */
  title: string;
  /** Занятия расписания, о которых материал; пусто — общий материал. */
  audience: ReadonlySet<string>;
}

export interface MaterialNoticeModels {
  materialModel: Model<MaterialRecord>;
  lessonModel: Model<LessonRecord>;
  classModel: Model<ClassRecord>;
}

// `type`, не `interface`: `decryptRecord` принимает `Record<string, unknown>`.
type LeanAnnounced = {
  _id: Types.ObjectId;
  title: string;
  classIds: Types.ObjectId[];
  lessonIds: Types.ObjectId[];
  // У материалов, созданных до тегов, поля в документе нет (`.lean()` default не
  // подставляет, material.mapper.ts).
  tags?: string[];
};

/** Занятие расписания для каждой привязанной даты — одним запросом на все
 * материалы пачки. Удалённая дата из привязки уходит сама (`detachMaterialReference`),
 * а если не ушла, её просто нет в ответе. */
async function classIdByLessonId(
  lessonModel: Model<LessonRecord>,
  lessonIds: readonly Types.ObjectId[],
): Promise<Map<string, string>> {
  if (lessonIds.length === 0) return new Map();
  const lessons = await lessonModel
    .find({ _id: { $in: [...lessonIds] } }, { classId: 1 })
    .lean<{ _id: Types.ObjectId; classId: Types.ObjectId }[]>();
  return new Map(lessons.map((l) => [l._id.toString(), l.classId.toString()]));
}

/** Активные занятия расписания с тегами — для сверки по тегам материала. Без
 * тегов у занятия сверять нечего, их в выборку не берём. */
async function findActiveTaggedClasses(
  classModel: Model<ClassRecord>,
): Promise<AudienceClass[]> {
  const classes = await classModel
    .find({ active: true, 'tags.0': { $exists: true } }, { tags: 1 })
    .lean<{ _id: Types.ObjectId; tags: string[] }[]>();
  return classes.map((c) => ({ id: c._id.toString(), tags: c.tags }));
}

/** Материалы с `announceAt` в окне повторов (`LESSON_NOTICE_WINDOW_HOURS`),
 * открытые ученикам СЕЙЧАС: доступ проверяется на тике, а не при создании — если
 * учитель успел перевести материал в «Только преподаватели», объявлять уже нечего.
 * Отбор «можно открыть» (`STUDENT_OPENABLE_FILTER`, ADR-0134) тот же, что у библиотеки
 * ученика: материал без ссылки ждёт файл, ведь строка ленты, за которой ученик ничего
 * не найдёт, хуже её отсутствия, — файл догрузился в окне, и следующий тик объявит.
 * Удалённый материал в выборку не попадает сам. Сначала те, кому окно кончится раньше. */
export async function findAnnouncedMaterials(
  { materialModel, lessonModel, classModel }: MaterialNoticeModels,
  now: DateTime,
): Promise<PlanMaterial[]> {
  const docs = await materialModel
    .find(
      {
        announceAt: { $gte: noticeWindowStart(now) },
        access: 'all',
        ...STUDENT_OPENABLE_FILTER,
      },
      { title: 1, classIds: 1, lessonIds: 1, tags: 1 },
    )
    .sort({ announceAt: 1 })
    .limit(LIST_LIMIT_MAX)
    .lean<LeanAnnounced[]>();
  if (docs.length === 0) return [];

  const needsTags = docs.some((doc) => (doc.tags ?? []).length > 0);
  const [classByLesson, activeClasses] = await Promise.all([
    classIdByLessonId(
      lessonModel,
      docs.flatMap((doc) => doc.lessonIds),
    ),
    needsTags ? findActiveTaggedClasses(classModel) : Promise.resolve([]),
  ]);
  return docs.map((doc) => ({
    id: doc._id.toString(),
    title: decryptRecord(doc, MATERIAL_ENCRYPT_SCHEMA).title,
    audience: materialAudienceClassIds({
      classIds: doc.classIds.map((id) => id.toString()),
      lessonClassIds: doc.lessonIds.flatMap(
        (id) => classByLesson.get(id.toString()) ?? [],
      ),
      tags: doc.tags ?? [],
      activeClasses,
    }),
  }));
}
