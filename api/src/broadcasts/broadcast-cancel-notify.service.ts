// Шаг тика планировщика (docs/PLAN.md §6 «Планировщик») — DM учителю про
// broadcast, который сам себя отменил (insertCancelledPlaceholder,
// broadcast.inserts.ts): «нет каналов», «все каналы выключены», «нет
// ссылки», «тик опоздал». Живёт физически в broadcasts/, провайдер — в
// SchedulerModule (тот же приём, что у BroadcastPlannerService/PreviewService
// — комментарий в scheduler.module.ts): так TeacherNotifier (TelegramModule)
// не нужен BroadcastsModule напрямую и не образует цикл (ADR-0013) с
// RecordingBroadcastService, который и создаёт часть этих плейсхолдеров.
// `channelIds: []` — надёжный признак именно автоматического плейсхолдера:
// ручная отмена учителем (BroadcastsService.cancel) переводит статус
// существующей рассылки с непустыми channelIds, эта рассылка сюда не попадает
// (учитель и так знает, что сам её отменил).
import { Inject, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { DateTime } from 'luxon';
import type { Model, Types } from 'mongoose';
import { claimOnce } from '../common/claim-once';
import { TEACHER_NOTIFIER, type TeacherNotifier } from '../deliveries/teacher-notifier';
import { decrypt } from '../utils/encryption';
import { BroadcastRecord } from './broadcast.schema';

interface DueCancelledBroadcast {
  _id: Types.ObjectId;
  lessonId?: Types.ObjectId;
  text: string;
}

export interface BroadcastCancelNotifyResult {
  /** Рассылок, для которых этот вызов «забрал» уведомление (условный апдейт
   * teacherNotifiedAt сработал) — не число реально отправленных DM: причина
   * может не требовать действия («класс выключен»), тогда notifyBroadcastCancelled
   * ничего не шлёт, но повтор всё равно не нужен. */
  claimed: number;
}

@Injectable()
export class BroadcastCancelNotifyService {
  constructor(
    @InjectModel(BroadcastRecord.name)
    private readonly broadcastModel: Model<BroadcastRecord>,
    @Inject(TEACHER_NOTIFIER) private readonly notifier: TeacherNotifier,
  ) {}

  async notifyPending(now: DateTime): Promise<BroadcastCancelNotifyResult> {
    const due = await this.broadcastModel
      .find(
        {
          status: 'cancelled',
          channelIds: { $size: 0 },
          teacherNotifiedAt: { $exists: false },
        },
        { lessonId: 1, text: 1 },
      )
      .lean<DueCancelledBroadcast[]>();
    if (due.length === 0) return { claimed: 0 };

    let claimed = 0;
    for (const broadcast of due) {
      if (await claimOnce(this.broadcastModel, broadcast._id, 'teacherNotifiedAt', now)) {
        await this.notifier.notifyBroadcastCancelled(
          {
            broadcastId: broadcast._id.toString(),
            lessonId: broadcast.lessonId?.toString(),
            // Пустой text (не расшифровался) — reason пустой строкой:
            // classifyCancelReason её не узнает, notifyBroadcastCancelled
            // просто не пришлёт DM (тот же принцип, что у PreviewService).
            reason: decrypt(broadcast.text) ?? '',
          },
          now,
        );
        claimed += 1;
      }
    }
    return { claimed };
  }
}
