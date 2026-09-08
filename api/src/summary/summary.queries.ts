// Запросы сводки к Mongo — countDocuments по индексам, без интерпретации
// результата (чистый форматтер — summary.format.ts). Период `from..to` общий
// для всех счётчиков (docs/PLAN.md §6 «Сводка»).
import type { Model, Types } from 'mongoose';
import type { DeliveryStatus, NextLessonSummary } from '@xuanxue/shared';
import { toIsoUtc } from '../common/iso-date';
import type { BroadcastRecord } from '../broadcasts/broadcast.schema';
import type { ChannelRecord } from '../channels/channel.schema';
import type { ClassRecord } from '../classes/class.schema';
import type { DeliveryRecord } from '../deliveries/delivery.schema';
import type { LessonRecord } from '../lessons/lesson.schema';

export function countBroadcastsSent(
  model: Model<BroadcastRecord>,
  from: Date,
  to: Date,
): Promise<number> {
  return model.countDocuments({ status: 'sent', sentAt: { $gte: from, $lte: to } });
}

/** Отменено самим планировщиком/рассылкой записи (insertCancelledPlaceholder,
 * broadcast.inserts.ts), не учителем через «Рассылки» — тот же признак
 * `channelIds: []`, что у BroadcastCancelNotifyService (docs/PLAN.md §6
 * «Планировщик»). `scheduledAt` у такого плейсхолдера — момент самой отмены
 * (`now` тика/вызова), не меняется задним числом — та же форма (status,
 * время), что у countBroadcastsSent. */
export function countBroadcastsCancelled(
  model: Model<BroadcastRecord>,
  from: Date,
  to: Date,
): Promise<number> {
  return model.countDocuments({
    status: 'cancelled',
    channelIds: { $size: 0 },
    scheduledAt: { $gte: from, $lte: to },
  });
}

export function countDeliveriesByStatus(
  model: Model<DeliveryRecord>,
  status: DeliveryStatus,
  from: Date,
  to: Date,
): Promise<number> {
  return model.countDocuments({ status, createdAt: { $gte: from, $lte: to } });
}

/** Доставки в ручной канал, которые ждут кнопки «отметить отправленным»
 * (docs/PLAN.md §6 «Доставка») — `pending` (учитель ещё не успел) и `manual`
 * (обычный путь после тика раннера). */
export async function countManualWaiting(
  deliveryModel: Model<DeliveryRecord>,
  channelModel: Model<ChannelRecord>,
  from: Date,
  to: Date,
): Promise<number> {
  const manualChannels = await channelModel
    .find({ type: 'manual' }, { _id: 1 })
    .lean<{ _id: Types.ObjectId }[]>();
  if (manualChannels.length === 0) return 0;
  return deliveryModel.countDocuments({
    channelId: { $in: manualChannels.map((channel) => channel._id) },
    status: { $in: ['pending', 'manual'] satisfies DeliveryStatus[] },
    createdAt: { $gte: from, $lte: to },
  });
}

/** Ближайшее занятие впереди — не ограничено периодом сводки: 30 дней назад
 * не имеет отношения к тому, когда занятие будет. Класс занятия пропал из
 * базы — не отдаём nextLesson вовсе (`undefined`, не пустой `title`): карточка
 * без названия ничего не сообщает учителю, честнее показать «занятий не
 * запланировано», чем строку-заглушку. */
export async function findNextLesson(
  lessonModel: Model<LessonRecord>,
  classModel: Model<ClassRecord>,
  now: Date,
): Promise<NextLessonSummary | undefined> {
  const lesson = await lessonModel
    .findOne(
      { status: 'scheduled', startsAt: { $gte: now } },
      { classId: 1, startsAt: 1 },
    )
    .sort({ startsAt: 1 })
    .lean<{ _id: Types.ObjectId; classId: Types.ObjectId; startsAt: Date } | null>();
  if (!lesson) return undefined;
  const cls = await classModel
    .findById(lesson.classId, { title: 1 })
    .lean<{ title: string } | null>();
  if (!cls) return undefined;
  return {
    lessonId: lesson._id.toString(),
    title: cls.title,
    startsAt: toIsoUtc(lesson.startsAt),
  };
}
