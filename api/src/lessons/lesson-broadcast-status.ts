// Статус ссылки на занятие для карточки «Планирования» (docs/PLAN.md §6
// п.3): один запрос на весь список, не по занятию (без N+1) — LessonsService
// .list зовёт эту функцию вместо прямого find на broadcastModel.
import type { Model, Types } from 'mongoose';
import type { BroadcastStatus } from '@xuanxue/shared';
import type { BroadcastRecord } from '../broadcasts/broadcast.schema';

interface LessonLinkBroadcast {
  lessonId: Types.ObjectId;
  status: BroadcastStatus;
}

/** Карта lessonId → статус рассылки-ссылки (`kind: 'lesson_link'`) для всех
 * переданных занятий разом. */
export async function findLinkBroadcastStatusByLessonId(
  model: Model<BroadcastRecord>,
  lessonIds: Types.ObjectId[],
): Promise<Map<string, BroadcastStatus>> {
  const broadcasts = await model
    .find(
      { lessonId: { $in: lessonIds }, kind: 'lesson_link' },
      { lessonId: 1, status: 1 },
    )
    .lean<LessonLinkBroadcast[]>();
  return new Map(broadcasts.map((b) => [b.lessonId.toString(), b.status]));
}
