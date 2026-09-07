// cancelled-плейсхолдер + лог решения планировщика — вынесено из
// broadcast-planner.service.ts (файл-лимит 150 строк, CLAUDE.md «Храповики»):
// сервис делегирует «отменить и залогировать» целиком, оставляя себе только
// выбор reason/level по исходу decideBroadcast.
import type { Logger } from '@nestjs/common';
import type { DateTime } from 'luxon';
import type { Model, Types } from 'mongoose';
import type { BroadcastRecord } from './broadcast.schema';
import { insertCancelledPlaceholder } from './broadcast.inserts';

/** cancelled-плейсхолдер + лог — лог только если плейсхолдер реально создан
 * этим вызовом: второй тик на том же занятии молчит (индекс lessonId+kind).
 * Текст лога для `error` — устоявшийся, его grep'ает RUNBOOK §8.1; для
 * `warn` собирается из причины (та же причина — в тексте плейсхолдера). */
export async function cancelPlanningWithLog(
  broadcastModel: Model<BroadcastRecord>,
  logger: Logger,
  lessonId: Types.ObjectId,
  reason: string,
  now: DateTime,
  level: 'warn' | 'error',
): Promise<false> {
  const created = await insertCancelledPlaceholder(
    broadcastModel,
    { kind: 'lesson_link', lessonId, reason },
    now,
  );
  if (!created) return false;
  const id = lessonId.toString();
  if (level === 'error') {
    logger.error(`рассылка пропущена: занятие ${id} началось больше получаса назад`);
  } else {
    logger.warn(`рассылка ссылки пропущена: занятие ${id}: ${reason}`);
  }
  return false;
}
