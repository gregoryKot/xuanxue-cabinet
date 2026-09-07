// Сводка школы (`GET /summary`, docs/PLAN.md §6, CLAUDE.md «Продуктовая
// фича = число в „Сводке“») — счётчики за SUMMARY_PERIOD_DAYS (30) дней и
// ближайшее занятие. Запросы — summary.queries.ts, форматирование и
// «пока нечего показать» на пустой базе — summary.format.ts (файл-лимит 150
// строк, CLAUDE.md «Храповики»).
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { DateTime } from 'luxon';
import type { Model } from 'mongoose';
import { SUMMARY_PERIOD_DAYS, type SummaryDto } from '@xuanxue/shared';
import { BroadcastRecord } from '../broadcasts/broadcast.schema';
import { ChannelRecord } from '../channels/channel.schema';
import { ClassRecord } from '../classes/class.schema';
import { DeliveryRecord } from '../deliveries/delivery.schema';
import { LessonRecord } from '../lessons/lesson.schema';
import { formatSummary } from './summary.format';
import {
  countBroadcastsSent,
  countDeliveriesByStatus,
  countManualWaiting,
  findNextLesson,
} from './summary.queries';

@Injectable()
export class SummaryService {
  constructor(
    @InjectModel(BroadcastRecord.name)
    private readonly broadcastModel: Model<BroadcastRecord>,
    @InjectModel(DeliveryRecord.name)
    private readonly deliveryModel: Model<DeliveryRecord>,
    @InjectModel(ChannelRecord.name) private readonly channelModel: Model<ChannelRecord>,
    @InjectModel(LessonRecord.name) private readonly lessonModel: Model<LessonRecord>,
    @InjectModel(ClassRecord.name) private readonly classModel: Model<ClassRecord>,
  ) {}

  async get(now: DateTime): Promise<SummaryDto> {
    const from = now.minus({ days: SUMMARY_PERIOD_DAYS }).toJSDate();
    const to = now.toJSDate();
    const [
      broadcastsSent,
      deliveriesFailed,
      deliveriesPending,
      manualWaiting,
      nextLesson,
    ] = await Promise.all([
      countBroadcastsSent(this.broadcastModel, from, to),
      countDeliveriesByStatus(this.deliveryModel, 'failed', from, to),
      countDeliveriesByStatus(this.deliveryModel, 'pending', from, to),
      countManualWaiting(this.deliveryModel, this.channelModel, from, to),
      findNextLesson(this.lessonModel, this.classModel, to),
    ]);
    return formatSummary(
      { broadcastsSent, deliveriesFailed, deliveriesPending, manualWaiting, nextLesson },
      now,
    );
  }
}
