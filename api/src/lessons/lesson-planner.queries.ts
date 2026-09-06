// Запросы планировщика к Mongo — без DI, решения принимает reconcileClass
// (lesson-reconcile.ts); LessonPlannerService вызывает эти функции и логирует
// собственные ошибки классов. Один файл — один слой: сервис ≤150 строк.
import type { Logger } from '@nestjs/common';
import type { DateTime } from 'luxon';
import type { Model, Types } from 'mongoose';
import { DEFAULT_LEAD_MINUTES } from '@xuanxue/shared';
import { errorMessage, errorStack } from '../common/error-info';
import {
  isDuplicateKeyBulkError,
  isDuplicateKeyError,
} from '../common/mongo-error-codes';
import type { ExpectedOccurrence } from './lesson-occurrences';
import { buildLessonDocs } from './lesson-reconcile';
import type { LessonLean } from './lesson-touched';
import type { LessonRecord } from './lesson.schema';

// Проекция под TouchFields + служебные поля reconcileClass — индекс
// `{ classId: 1, startsAt: 1 }` уже есть (lesson.schema.ts), `startsAt: { $gt }`
// использует его же и заодно отсекает прошлое: `leadBoundaryMs` в
// reconcileClass всегда не раньше `now`, так что более узкий фильтр здесь
// ничего не теряет.
const LESSON_PROJECTION = {
  topic: 1,
  status: 1,
  startsAt: 1,
  plannedAt: 1,
  durationMin: 1,
  zoomLinkOverride: 1,
  zoomPasswordOverride: 1,
  note: 1,
  recordings: 1,
  leaderId: 1,
  ruleId: 1,
} as const;

export function findPlannedLessons(
  lessonModel: Model<LessonRecord>,
  classId: Types.ObjectId,
  now: DateTime,
): Promise<LessonLean[]> {
  return lessonModel
    .find(
      { classId, plannedAt: { $exists: true }, startsAt: { $gt: now.toJSDate() } },
      LESSON_PROJECTION,
    )
    .lean<LessonLean[]>();
}

// Коллизия переносов (два правила меняются местами одним сохранением)
// проходит проверку reconcileClass, но целевое место в базе может занять
// конкурирующее занятие того же класса раньше, чем выполнится этот `updateOne`
// — единственный уникальный индекс, который это ловит, срабатывает здесь.
// `false` — «не в этот раз», не ошибка: следующий тик увидит новую картину
// существующих занятий и найдёт перенос заново.
export async function moveLesson(
  lessonModel: Model<LessonRecord>,
  move: { id: Types.ObjectId; plannedAt: DateTime; durationMin: number },
): Promise<boolean> {
  try {
    await lessonModel.updateOne(
      { _id: move.id },
      {
        $set: {
          plannedAt: move.plannedAt.toJSDate(),
          startsAt: move.plannedAt.toJSDate(),
          durationMin: move.durationMin,
        },
      },
    );
    return true;
  } catch (err) {
    if (!isDuplicateKeyError(err)) throw err;
    return false;
  }
}

// Без upsert — diff в памяти (reconcileClass), insertMany(ordered: false). В
// стационарном режиме missing пуст; гонка двух тиков даёт E11000 на части
// документов — не ошибка, а «конкурент уже вставил».
export async function insertMissing(
  lessonModel: Model<LessonRecord>,
  classId: Types.ObjectId,
  missing: readonly ExpectedOccurrence[],
): Promise<number> {
  if (missing.length === 0) return 0;
  const docs = buildLessonDocs(classId, missing);
  try {
    const inserted = await lessonModel.insertMany(docs, { ordered: false });
    return inserted.length;
  } catch (err) {
    if (!isDuplicateKeyBulkError(err)) throw err;
    const insertedDocs = (err as { insertedDocs?: unknown[] }).insertedDocs;
    return insertedDocs?.length ?? 0;
  }
}

export async function deleteLessons(
  lessonModel: Model<LessonRecord>,
  ids: readonly Types.ObjectId[],
): Promise<number> {
  if (ids.length === 0) return 0;
  const { deletedCount } = await lessonModel.deleteMany({ _id: { $in: ids } });
  return deletedCount;
}

// Класса нет в базе (удалили) — его занятия нельзя отрендерить (нет
// названия, ссылки), поэтому удаляются независимо от «тронутости»; граница —
// на дефолтном `leadMinutes`, свой класс спросить уже не у кого.
export async function deleteOrphanLessons(
  lessonModel: Model<LessonRecord>,
  knownClassIds: readonly Types.ObjectId[],
  now: DateTime,
  logger: Logger,
): Promise<number> {
  const boundary = now.plus({ minutes: DEFAULT_LEAD_MINUTES }).toJSDate();
  const orphanIds = await lessonModel.distinct('classId', {
    plannedAt: { $exists: true },
    classId: { $nin: knownClassIds },
    startsAt: { $gt: boundary },
  });
  if (orphanIds.length === 0) return 0;

  let removed = 0;
  for (const classId of orphanIds) {
    try {
      const { deletedCount } = await lessonModel.deleteMany({
        classId,
        plannedAt: { $exists: true },
        startsAt: { $gt: boundary },
      });
      removed += deletedCount;
    } catch (err) {
      logger.error(
        `Удаление занятий пропавшего класса ${String(classId)} упало: ${errorMessage(err)}`,
        errorStack(err),
      );
    }
  }
  return removed;
}
