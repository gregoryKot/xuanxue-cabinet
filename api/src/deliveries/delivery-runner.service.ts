// Раннер доставок: захват pending/просроченный sending → канал → адаптер →
// исход (docs/PLAN.md §6, ADR-0004). Запросы к Mongo, проверки перед
// отправкой и расчёт повтора вынесены в delivery-runner.queries.ts/
// delivery-runner.preflight.ts/delivery-runner.outcome.ts — сервис только
// связывает их (CLAUDE.md «Файлы»).
import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import type { DateTime } from 'luxon';
import type { Model } from 'mongoose';
import { errorMessage, errorStack } from '../common/error-info';
import { ChannelAdapterRegistry } from '../channels/channel-adapter.registry';
import { ChannelConfigService } from '../channels/channel-config.service';
import { scrubChannelSecrets } from '../channels/channel-secrets';
import { BroadcastRecord } from '../broadcasts/broadcast.schema';
import { LessonRecord } from '../lessons/lesson.schema';
import { nextDeliveryOutcome } from './delivery-runner.outcome';
import { runPreflight, type PreflightDeps } from './delivery-runner.preflight';
import {
  applyOutcome,
  claimDelivery,
  findClaimable,
  type ClaimedDelivery,
} from './delivery-runner.queries';
import { refreshBroadcastStatus } from './delivery-runner.status';
import { DeliveryRecord } from './delivery.schema';
import { TEACHER_NOTIFIER, type TeacherNotifier } from './teacher-notifier';

export interface DeliveryRunResult {
  sent: number;
  failed: number;
}

@Injectable()
export class DeliveryRunnerService {
  private readonly logger = new Logger(DeliveryRunnerService.name);

  constructor(
    @InjectModel(DeliveryRecord.name)
    private readonly deliveryModel: Model<DeliveryRecord>,
    @InjectModel(BroadcastRecord.name)
    private readonly broadcastModel: Model<BroadcastRecord>,
    @InjectModel(LessonRecord.name) private readonly lessonModel: Model<LessonRecord>,
    private readonly channelConfig: ChannelConfigService,
    private readonly adapters: ChannelAdapterRegistry,
    private readonly config: ConfigService,
    @Inject(TEACHER_NOTIFIER) private readonly notifier: TeacherNotifier,
  ) {}

  async run(now: DateTime): Promise<DeliveryRunResult> {
    const candidates = await findClaimable(this.deliveryModel, now);
    let sent = 0;
    let failed = 0;
    for (const candidate of candidates) {
      const claimed = await claimDelivery(this.deliveryModel, candidate._id, now);
      if (!claimed) continue; // проиграли гонку за эту доставку — не наша, следующий тик

      try {
        const result = await this.deliverOne(claimed, now);
        if (result === 'sent') sent += 1;
        if (result === 'failed') failed += 1;
      } catch (err) {
        // Зависание в 'sending' недопустимо (RUNBOOK §8.1): любой необработанный
        // сбой ниже этой строки — брак, а не ожидаемый исход; доставку
        // подберёт по DELIVERY_STALE_LOCK_MIN следующий тик.
        this.logger.error(
          `доставка ${claimed._id.toString()} упала вне адаптера: ${errorMessage(err)}`,
          errorStack(err),
        );
      }
    }
    return { sent, failed };
  }

  private async deliverOne(
    delivery: ClaimedDelivery,
    now: DateTime,
  ): Promise<'sent' | 'failed' | 'other'> {
    const preflight = await runPreflight(this.preflightDeps(), delivery, now);
    if (!preflight.ok) return preflight.result;

    const adapter = this.adapters.get(preflight.channel.type);
    const result = await adapter.send(
      { text: preflight.text, telegramFileId: preflight.telegramFileId },
      preflight.channel.config,
    );
    const scrubbed =
      result.status === 'failed'
        ? {
            ...result,
            error: scrubChannelSecrets(
              result.error,
              preflight.channel.config,
              this.botToken(),
            ),
          }
        : result;

    const outcome = nextDeliveryOutcome(scrubbed, delivery.attempts, now);
    await applyOutcome(this.deliveryModel, delivery._id, outcome);
    if (outcome.status === 'failed' && outcome.notifyTeacher) {
      await this.notifier.notifyDeliveryFailed({
        deliveryId: delivery._id.toString(),
        broadcastId: delivery.broadcastId.toString(),
        channelId: delivery.channelId.toString(),
        error: outcome.error,
      });
    }
    await refreshBroadcastStatus(
      this.deliveryModel,
      this.broadcastModel,
      delivery.broadcastId,
      now,
    );

    if (outcome.status === 'sent') return 'sent';
    if (outcome.status === 'failed') return 'failed';
    return 'other';
  }

  private preflightDeps(): PreflightDeps {
    return {
      deliveryModel: this.deliveryModel,
      broadcastModel: this.broadcastModel,
      lessonModel: this.lessonModel,
      channelConfig: this.channelConfig,
      notifier: this.notifier,
      logger: this.logger,
    };
  }

  private botToken(): string | undefined {
    return this.config.get<string>('BOT_TOKEN');
  }
}
