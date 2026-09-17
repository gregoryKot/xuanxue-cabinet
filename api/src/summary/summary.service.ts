// Сводка школы (`GET /summary`, docs/PLAN.md §6, CLAUDE.md «Продуктовая
// фича = число в „Сводке“») — счётчики за SUMMARY_PERIOD_DAYS (30) дней.
// Запросы — summary.queries.ts, форматирование и «пока нечего показать» на
// пустой базе — summary.format.ts (файл-лимит 150 строк, CLAUDE.md
// «Храповики»).
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { DateTime } from 'luxon';
import type { Model } from 'mongoose';
import { SUMMARY_PERIOD_DAYS, type SummaryDto } from '@xuanxue/shared';
import { BroadcastRecord } from '../broadcasts/broadcast.schema';
import { ChannelRecord } from '../channels/channel.schema';
import { DeliveryRecord } from '../deliveries/delivery.schema';
import { formatSummary } from './summary.format';
import {
  countBroadcastsCancelled,
  countBroadcastsSent,
  countDeliveriesByStatus,
  countManualWaiting,
} from './summary.queries';

@Injectable()
export class SummaryService {
  constructor(
    @InjectModel(BroadcastRecord.name)
    private readonly broadcastModel: Model<BroadcastRecord>,
    @InjectModel(DeliveryRecord.name)
    private readonly deliveryModel: Model<DeliveryRecord>,
    @InjectModel(ChannelRecord.name) private readonly channelModel: Model<ChannelRecord>,
  ) {}

  async get(now: DateTime): Promise<SummaryDto> {
    const from = now.minus({ days: SUMMARY_PERIOD_DAYS }).toJSDate();
    const to = now.toJSDate();
    const [
      broadcastsSent,
      broadcastsCancelled,
      deliveriesFailed,
      deliveriesPending,
      manualWaiting,
    ] = await Promise.all([
      countBroadcastsSent(this.broadcastModel, from, to),
      countBroadcastsCancelled(this.broadcastModel, from, to),
      countDeliveriesByStatus(this.deliveryModel, 'failed', from, to),
      countDeliveriesByStatus(this.deliveryModel, 'pending', from, to),
      countManualWaiting(this.deliveryModel, this.channelModel, from, to),
    ]);
    return formatSummary(
      {
        broadcastsSent,
        broadcastsCancelled,
        deliveriesFailed,
        deliveriesPending,
        manualWaiting,
      },
      now,
    );
  }
}
