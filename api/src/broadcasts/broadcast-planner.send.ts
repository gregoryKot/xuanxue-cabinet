// Отправка одного занятия: активные каналы класса → текст поста → insert
// broadcast+deliveries — вынесено из broadcast-planner.service.ts
// (файл-лимит 150 строк, CLAUDE.md «Храповики»).
import type { Logger } from '@nestjs/common';
import type { DateTime } from 'luxon';
import type { Model } from 'mongoose';
import type { TemplateKind } from '@xuanxue/shared';
import type { ChannelRecord } from '../channels/channel.schema';
import type { DeliveryRecord } from '../deliveries/delivery.schema';
import type { UsersService } from '../users/users.service';
import { insertBroadcastWithDeliveries } from './broadcast.inserts';
import { cancelPlanningWithLog } from './broadcast-planner.log';
import {
  findActiveChannelIds,
  type PlannerClass,
  type PlannerLesson,
} from './broadcast-planner.queries';
import { buildLessonLinkText } from './broadcast-planner.render';
import type { BroadcastRecord } from './broadcast.schema';

export interface SendLessonDeps {
  channelModel: Model<ChannelRecord>;
  broadcastModel: Model<BroadcastRecord>;
  deliveryModel: Model<DeliveryRecord>;
  usersService: UsersService;
  logger: Logger;
}

/** Активные каналы класса → текст поста-ссылки → broadcast+deliveries. Пустой
 * список активных каналов — cancelled-плейсхолдер, не ошибка (docs/PLAN.md §6). */
export async function sendLessonBroadcast(
  deps: SendLessonDeps,
  lesson: PlannerLesson,
  cls: PlannerClass,
  now: DateTime,
  templates: Record<TemplateKind, string>,
): Promise<boolean> {
  const activeChannelIds = await findActiveChannelIds(deps.channelModel, cls.channelIds);
  if (activeChannelIds.length === 0) {
    return cancelPlanningWithLog(
      deps.broadcastModel,
      deps.logger,
      lesson._id,
      'все каналы класса выключены',
      now,
      'warn',
    );
  }

  const text = await buildLessonLinkText(deps.usersService, lesson, cls, templates, now);
  const { isNew } = await insertBroadcastWithDeliveries(
    deps.broadcastModel,
    deps.deliveryModel,
    {
      kind: 'lesson_link',
      lessonId: lesson._id,
      channelIds: activeChannelIds,
      scheduledAt: now.toJSDate(),
      text,
    },
  );
  return isNew;
}
