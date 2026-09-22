// Отправка одной даты занятия: активные и подходящие по тегу каналы
// (ADR-0108) → текст поста → insert broadcast+deliveries — вынесено из
// broadcast-planner.service.ts (файл-лимит 150 строк, CLAUDE.md «Храповики»).
import type { Logger } from '@nestjs/common';
import type { DateTime } from 'luxon';
import type { Model } from 'mongoose';
import type { TemplateKind } from '@xuanxue/shared';
import type { ChannelRecord } from '../channels/channel.schema';
import type { DeliveryRecord } from '../deliveries/delivery.schema';
import type { UsersService } from '../users/users.service';
import { insertBroadcastWithDeliveries } from './broadcast.inserts';
import { computeBroadcastSendTiming } from './broadcast-send-timing';
import { findChannelsForLesson } from './broadcast-channels.queries';
import { CANCEL_REASON } from './broadcast-cancel-reasons';
import { cancelPlanningWithLog } from './broadcast-planner.log';
import type { PlannerClass, PlannerLesson } from './broadcast-planner.queries';
import { buildLessonLinkText } from './broadcast-planner.render';
import type { BroadcastRecord } from './broadcast.schema';

export interface SendLessonDeps {
  channelModel: Model<ChannelRecord>;
  broadcastModel: Model<BroadcastRecord>;
  deliveryModel: Model<DeliveryRecord>;
  usersService: UsersService;
  logger: Logger;
}

/** Активные и подходящие по тегу каналы (ADR-0108) → текст поста-ссылки →
 * broadcast+deliveries. Пустой список активных каналов и пустой список
 * подошедших по тегу — разные cancelled-плейсхолдеры, не одна причина
 * (docs/PLAN.md §6). */
export async function sendLessonBroadcast(
  deps: SendLessonDeps,
  lesson: PlannerLesson,
  cls: PlannerClass,
  now: DateTime,
  templates: Record<TemplateKind, string>,
): Promise<boolean> {
  // Тег даты занятия (свой, ADR-0075) + тег занятия в расписании, к которому
  // дата относится (ADR-0072) — оба считаются тегами даты для фильтра канала.
  const lessonTags = [...(lesson.tags ?? []), ...(cls.tags ?? [])];
  const { activeChannelIds, matchingChannelIds } = await findChannelsForLesson(
    deps.channelModel,
    cls.channelIds,
    lessonTags,
  );
  if (activeChannelIds.length === 0) {
    return cancelPlanningWithLog(
      deps.broadcastModel,
      deps.logger,
      lesson._id,
      CANCEL_REASON.allChannelsDisabled,
      now,
      'warn',
    );
  }
  if (matchingChannelIds.length === 0) {
    return cancelPlanningWithLog(
      deps.broadcastModel,
      deps.logger,
      lesson._id,
      CANCEL_REASON.noChannelsForTags,
      now,
      'warn',
    );
  }

  // sendAt — момент фактической отправки (не момент создания документа: тик
  // может создать broadcast заранее, на settings.previewMinutes раньше, окно
  // расширено в decideBroadcast, чтобы бот успел прислать предпросмотр);
  // `scheduledAt`/`nextAttemptAt` доставок — этот момент, раннер заберёт их
  // сам, когда он настанет (findClaimable). textNow — момент рендера текста
  // (см. broadcast-send-timing.ts).
  const { sendAt, textNow } = computeBroadcastSendTiming(
    lesson.startsAt,
    cls.leadMinutes,
    now,
  );
  const text = await buildLessonLinkText(
    deps.usersService,
    lesson,
    cls,
    templates,
    textNow,
  );
  const { isNew } = await insertBroadcastWithDeliveries(
    deps.broadcastModel,
    deps.deliveryModel,
    {
      kind: 'lesson_link',
      lessonId: lesson._id,
      channelIds: matchingChannelIds,
      scheduledAt: sendAt.toJSDate(),
      deliveryNextAttemptAt: sendAt.toJSDate(),
      text,
    },
  );
  return isNew;
}
