// Единственный путь удаления попытки экзамена вместе со всем, что на ней висит.
// Им идут оба места, где попытка уходит до удаления аккаунта: повторный старт
// затирает просроченную непроверенную (ExamAttemptRetryCleanupService,
// ADR-0131) и шаг тика убирает отслужившую срок (ExamAttemptRetentionSweepService,
// ADR-0153). Второй копии каскада не заводим: забытый в одной из них хвост
// (оценка, видео, уведомление) — это персональные данные ученика, которые
// пережили свою попытку молча (CLAUDE.md «Одна механика — один компонент»).
//
// Что уносит каскад и что нет:
// - `exam_gradings` — оценка и комментарий учителя;
// - `media_assets` (видео, ADR-0023) — байтов там нет, только file_id/ссылка,
//   поэтому просто `deleteMany`, стороннего хранилища чистить незачем;
// - уведомления об этой попытке (`notifications`, ADR-0113) — удаляются, а не
//   гасятся `dismissedAt`: та пометка защищает от воскрешения повторной
//   доставкой ТОГО ЖЕ события, а здесь событие ссылается на документ, которого
//   больше нет, и ссылка `/grading/:id` вела бы в 404;
// - `answer_videos` (файл в R2, ADR-0137) — НЕ трогаем: у нижележащей записи
//   `media_assets` ссылка уходит с попыткой, и AnswerVideoSweepService сам
//   убирает файл без ссылки в течение суток, второй механизм той же уборки
//   заводить незачем;
// - `exam_images`/`exam_videos` — НЕ трогаем: это данные школы, а сироту без
//   единой ссылки убирают их штатные уборщики.
import type { QueryFilter, Model, Types } from 'mongoose';
import type { NotificationRecord } from '../notifications/notification.schema';
import type { MediaAssetRecord } from '../media/media-asset.schema';
import type { ExamAttemptRecord } from './exam-attempt.schema';
import type { ExamGradingRecord } from './exam-grading.schema';

export interface AttemptCascadeModels {
  attemptModel: Model<ExamAttemptRecord>;
  gradingModel: Model<ExamGradingRecord>;
  mediaModel: Model<MediaAssetRecord>;
  notificationModel: Model<NotificationRecord>;
}

/** Удаляет попытку `attemptId`, если она ещё подходит под `guard`, и всё, что
 * на ней висит. `true` — попытку удалил именно этот вызов.
 *
 * Условие в `deleteOne` — не просто «удалить по id»: если учитель успел
 * проверить работу ровно в этот момент, а конкурирующий вызов уже удалил её,
 * фильтр не совпадёт. Попытка жива, но уже не подходит — каскад не трогаем,
 * историю оценки не рвём.
 *
 * Попытки уже нет, а хвосты остались — значит, прошлый вызов упал между
 * `deleteOne` и каскадом (или тот же вызов повторили). Хвосты дочищаются:
 * иначе оценка или ссылка на видео пережили бы срок хранения навсегда, а
 * уборщик по оценкам (он выбирает кандидатов по `exam_gradings`) находил бы
 * их каждый тик заново. Каскад идемпотентен. */
export async function deleteAttemptWithDependents(
  models: AttemptCascadeModels,
  attemptId: Types.ObjectId,
  guard: QueryFilter<ExamAttemptRecord>,
): Promise<boolean> {
  const { attemptModel, gradingModel, mediaModel, notificationModel } = models;
  const { deletedCount } = await attemptModel.deleteOne({ _id: attemptId, ...guard });
  if (deletedCount === 0 && (await attemptModel.exists({ _id: attemptId }))) {
    return false;
  }
  await Promise.all([
    gradingModel.deleteMany({ attemptId }),
    mediaModel.deleteMany({ attemptId }),
    notificationModel.deleteMany({ attemptId: attemptId.toString() }),
  ]);
  return deletedCount > 0;
}
