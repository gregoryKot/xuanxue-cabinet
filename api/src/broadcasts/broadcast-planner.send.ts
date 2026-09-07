// Отправка одного занятия: активные каналы класса → текст поста → insert
// broadcast+deliveries — вынесено из broadcast-planner.service.ts
// (файл-лимит 150 строк, CLAUDE.md «Храповики»).
import type { Logger } from '@nestjs/common';
import { DateTime } from 'luxon';
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

  // Момент фактической отправки — startsAt минус leadMinutes класса, не
  // момент создания документа: тик может создать broadcast заранее, на
  // PREVIEW_MINUTES раньше (окно расширено в decideBroadcast), чтобы бот
  // успел прислать предпросмотр. `scheduledAt`/`nextAttemptAt` доставок —
  // этот момент, раннер заберёт их сам, когда он настанет (findClaimable).
  const sendAt = DateTime.fromJSDate(lesson.startsAt, { zone: 'utc' }).minus({
    minutes: cls.leadMinutes,
  });
  // Текст рендерим на момент реальной отправки, а не на момент создания
  // документа — иначе «через {минут} минут» в посте, отправленном на
  // PREVIEW_MINUTES раньше своего времени, отставало бы от реальности на эти
  // же минуты. Догоняющий тик (sendAt уже в прошлом) — рендерим на `now`,
  // как раньше: минут до начала действительно меньше leadMinutes.
  const textNow = sendAt > now ? sendAt : now;
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
      channelIds: activeChannelIds,
      scheduledAt: sendAt.toJSDate(),
      deliveryNextAttemptAt: sendAt.toJSDate(),
      text,
    },
  );
  return isNew;
}
