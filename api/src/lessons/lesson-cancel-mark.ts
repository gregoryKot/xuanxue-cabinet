// Момент отмены занятия (`cancelledAt`, ADR-0162) — отдельной записью перед
// основным PATCH, а не полем `$set` в нём: «только если занятие не было
// отменено» не выразить в одном `findOneAndUpdate` без чтения прежнего статуса,
// а чтение и запись порознь разъехались бы при двух одновременных PATCH.
import type { DateTime } from 'luxon';
import type { Model } from 'mongoose';
import type { LessonRecord } from './lesson.schema';

/** Ставит `cancelledAt` занятию, которое сейчас не отменено. Повторный PATCH
 * со статусом `cancelled` первый момент не сдвигает, а занятие, отменённое до
 * появления поля, не получает момента вовсе — его не объявят задним числом.
 * Зовётся только когда PATCH переводит статус в `cancelled`; основная запись
 * после неё и меняет статус: пока она не прошла, занятие остаётся
 * `scheduled`, и шаг тика его не видит. Упавшая основная запись оставляет
 * лишнюю отметку на `scheduled`-занятии — безвредную: следующая отмена её
 * перепишет, возврат в расписание снимет. */
export async function markCancelledAt(
  model: Model<LessonRecord>,
  lessonId: string,
  now: DateTime,
): Promise<void> {
  await model.updateOne(
    { _id: lessonId, status: { $ne: 'cancelled' } },
    { $set: { cancelledAt: now.toJSDate() } },
  );
}
