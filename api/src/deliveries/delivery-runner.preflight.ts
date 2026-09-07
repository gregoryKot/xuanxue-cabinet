// Проверки перед вызовом адаптера — вынесено из delivery-runner.service.ts
// (файл-лимит 150 строк, CLAUDE.md «Храповики»): канал удалён/неактивен,
// рассылка не найдена, занятие отменено/удалено, текст не расшифровался.
// Каждый стоп-путь сам применяет исход к БД — сервису остаётся только выйти
// с готовым результатом тика. `failNoRetry` — тоже здесь: она обслуживает
// именно эти сбои (канал удалён, рассылка не найдена, текст не
// расшифровался), других вызывающих у неё нет.
import type { Logger } from '@nestjs/common';
import type { DateTime } from 'luxon';
import type { Model } from 'mongoose';
import type { ChannelConfig, ChannelType } from '@xuanxue/shared';
import { errorMessage } from '../common/error-info';
import { decrypt } from '../utils/encryption';
import type { ChannelConfigService } from '../channels/channel-config.service';
import type { BroadcastRecord } from '../broadcasts/broadcast.schema';
import type { LessonRecord } from '../lessons/lesson.schema';
import { failNoRetryOutcome } from './delivery-runner.outcome';
import {
  applyOutcome,
  findLessonStatus,
  type ClaimedDelivery,
} from './delivery-runner.queries';
import {
  refreshBroadcastStatus,
  stopForCancelledLesson,
  stopForInactiveChannel,
} from './delivery-runner.status';
import type { DeliveryRecord } from './delivery.schema';
import type { TeacherNotifier } from './teacher-notifier';

export interface PreflightDeps {
  deliveryModel: Model<DeliveryRecord>;
  broadcastModel: Model<BroadcastRecord>;
  lessonModel: Model<LessonRecord>;
  channelConfig: ChannelConfigService;
  notifier: TeacherNotifier;
  logger: Logger;
}

export type PreflightResult =
  | {
      ok: true;
      channel: { type: ChannelType; config: ChannelConfig; active: boolean };
      text: string;
      telegramFileId?: string;
    }
  | { ok: false; result: 'failed' | 'other' };

/** Всё, что может остановить доставку до вызова адаптера. `ok: false` —
 * исход уже записан в БД (включая пересчёт статуса broadcast), сервису
 * остаётся вернуть `result` из своего `deliverOne`. */
export async function runPreflight(
  deps: PreflightDeps,
  delivery: ClaimedDelivery,
  now: DateTime,
): Promise<PreflightResult> {
  let channel: { type: ChannelType; config: ChannelConfig; active: boolean };
  try {
    channel = await deps.channelConfig.readConfig(delivery.channelId.toString());
  } catch (err) {
    // Канал удалили между планированием и отправкой — досылать некому,
    // повтор не поможет (RUNBOOK §8.1).
    const result = await failNoRetry(
      deps,
      delivery,
      now,
      'Канал удалён.',
      errorMessage(err),
    );
    return { ok: false, result };
  }

  const broadcast = await deps.broadcastModel.findById(delivery.broadcastId).lean();
  if (!broadcast) {
    const result = await failNoRetry(deps, delivery, now, 'Рассылка не найдена.');
    return { ok: false, result };
  }

  if (broadcast.lessonId) {
    const status = await findLessonStatus(deps.lessonModel, broadcast.lessonId);
    if (status !== 'scheduled') {
      await stopForCancelledLesson(
        deps.deliveryModel,
        deps.broadcastModel,
        deps.logger,
        delivery,
        broadcast.lessonId,
      );
      return { ok: false, result: 'other' };
    }
  }

  if (!channel.active) {
    await stopForInactiveChannel(
      deps.deliveryModel,
      deps.broadcastModel,
      delivery._id,
      delivery.broadcastId,
      now,
    );
    return { ok: false, result: 'other' };
  }

  const text = decrypt(broadcast.text);
  if (!text) {
    const result = await failNoRetry(
      deps,
      delivery,
      now,
      'Текст рассылки не расшифровался — проверьте ENCRYPTION_KEY.',
    );
    return { ok: false, result };
  }

  return { ok: true, channel, text, telegramFileId: broadcast.telegramFileId };
}

/** Сбой до/вне адаптера — сразу `failed` без повтора: адаптер тут ни при
 * чём, следующая попытка упадёт на том же месте, а зависшая в 'sending'
 * доставка страшнее лишней записи в журнал. `detail` — для лога (может
 * содержать текст исключения), в error доставки не идёт: там — короткая
 * формулировка для учителя/RUNBOOK. */
async function failNoRetry(
  deps: PreflightDeps,
  delivery: ClaimedDelivery,
  now: DateTime,
  error: string,
  detail?: string,
): Promise<'failed'> {
  deps.logger.warn(
    `доставка ${delivery._id.toString()}: ${error}${detail ? ` (${detail})` : ''}`,
  );
  const outcome = failNoRetryOutcome(delivery.attempts, error);
  await applyOutcome(deps.deliveryModel, delivery._id, outcome);
  await deps.notifier.notifyDeliveryFailed({
    deliveryId: delivery._id.toString(),
    broadcastId: delivery.broadcastId.toString(),
    channelId: delivery.channelId.toString(),
    error,
  });
  await refreshBroadcastStatus(
    deps.deliveryModel,
    deps.broadcastModel,
    delivery.broadcastId,
    now,
  );
  return 'failed';
}
