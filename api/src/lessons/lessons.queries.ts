// Запросы к базе для LessonsService без DI — тот же приём, что у
// lesson-planner.queries.ts: сервис остаётся коротким оркестратором, а
// одиночные чтения/удаления живут рядом со своими текстами ошибок.
import type { DateTime } from 'luxon';
import type { Model, Types } from 'mongoose';
import type { LessonDto, ListLessonsQuery } from '@xuanxue/shared';
import { ConflictError, NotFoundError } from '../common/errors';
import { assertObjectId } from '../common/object-id';
import { decryptRecord } from '../utils/encryption';
import type { ClassRecord } from '../classes/class.schema';
import { LESSON_ENCRYPT_SCHEMA, type LessonRecord } from './lesson.schema';
import { toLessonDto, type LeanLesson } from './lesson.mapper';

export const LESSON_NOT_FOUND = 'Дата занятия не найдена. Обновите расписание.';
const CANNOT_DELETE_PLANNED = 'Эту дату создало расписание. Отмените её вместо удаления.';
const DURATION_FROM_SCHEDULE =
  'Длительность этой даты берётся из расписания. Поменяйте правило занятия.';

export function assertLessonId(id: string): void {
  assertObjectId(id, LESSON_NOT_FOUND);
}

/** Фильтр списка `GET /lessons`: окно дат обязательно (его разбирает и
 * проверяет сервис), остальное — необязательные сужения. `classId` приходит
 * уже проверенным: кривой id у занятий — ошибка запроса, а не пустой список,
 * в отличие от материалов. */
export function buildLessonsFilter(
  query: ListLessonsQuery,
  from: DateTime,
  to: DateTime,
): Record<string, unknown> {
  const filter: Record<string, unknown> = {
    startsAt: { $gte: from.toJSDate(), $lt: to.toJSDate() },
  };
  if (query.classId !== undefined) filter.classId = query.classId;
  // Истинностная проверка, не `!== undefined` (ADR-0059, как у
  // buildMaterialsFilter): пустая строка в query — «фильтр не задан», а не
  // «тег — пустая строка», иначе список молча оказался бы пустым.
  if (query.tag) filter.tags = query.tag;
  return filter;
}

export async function findLessonDto(
  model: Model<LessonRecord>,
  id: string,
): Promise<LessonDto> {
  assertLessonId(id);
  const doc = await model.findById(id).lean<LeanLesson>();
  if (!doc) throw new NotFoundError(LESSON_NOT_FOUND);
  return toLessonDto(decryptRecord(doc, LESSON_ENCRYPT_SCHEMA));
}

// У даты из расписания длительность держит правило класса: reconcileClass
// (lesson-reconcile.ts) на каждом тике сверяет durationMin с правилом и
// переносит дату на месте (isLessonTouched её не видит — см. комментарий
// там же), так что ручная правка потерялась бы на следующем тике. Менять
// её можно только через правило — как у deleteOneOffLesson с самой датой.
export async function assertDurationEditable(
  model: Model<LessonRecord>,
  id: string,
): Promise<void> {
  const doc = await model
    .findById(id, { plannedAt: 1 })
    .lean<{ plannedAt?: Date } | null>();
  if (!doc) throw new NotFoundError(LESSON_NOT_FOUND);
  if (doc.plannedAt) throw new ConflictError(DURATION_FROM_SCHEDULE);
}

// Только разовая дата удаляется целиком: у даты из расписания планировщик
// сам решает её судьбу при следующем тике, вручную — только отмена.
export async function deleteOneOffLesson(
  model: Model<LessonRecord>,
  id: string,
): Promise<void> {
  assertLessonId(id);
  const { deletedCount } = await model.deleteOne({
    _id: id,
    plannedAt: { $exists: false },
  });
  if (deletedCount > 0) return;
  const stillExists = await model.exists({ _id: id });
  if (stillExists) throw new ConflictError(CANNOT_DELETE_PLANNED);
  throw new NotFoundError(LESSON_NOT_FOUND);
}

/** Название класса для title записи по умолчанию; класса нет — пустая
 * строка, не ошибка: запись всё равно нужно сохранить. */
export async function findClassTitle(
  classModel: Model<ClassRecord>,
  classId: Types.ObjectId,
): Promise<string> {
  const cls = await classModel
    .findById(classId, { title: 1 })
    .lean<{ title: string } | null>();
  return cls?.title ?? '';
}
