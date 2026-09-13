// Реализация TeacherNotifier поверх бота (заменяет прежнюю LogTeacherNotifier
// — CLAUDE.md «Дубли и мёртвый код»): сбой доставки/шага тика идёт учителю в
// личный чат (PersonalChats), лог остаётся здесь же как fallback, если писать
// некому (ни одного подключённого чата). Провайдер по токену TEACHER_NOTIFIER
// — SchedulerModule (docs/PLAN.md §6, RUNBOOK §8.1).
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { DateTime } from 'luxon';
import type { Model, Types } from 'mongoose';
import { SCHOOL_TZ } from '@xuanxue/shared';
import { BroadcastRecord } from '../broadcasts/broadcast.schema';
import { ChannelRecord } from '../channels/channel.schema';
import { ClassRecord } from '../classes/class.schema';
import type {
  CancelledBroadcastContext,
  FailedDeliveryContext,
  TeacherNotifier,
} from '../deliveries/teacher-notifier';
import { LessonRecord } from '../lessons/lesson.schema';
import { cancelledBroadcastMessage } from './broadcast-cancel-message';
import { PersonalChats } from './personal-chats';
import { TelegramBotService } from './telegram-bot.service';

// Тот же шаг тика повторно не будит учителя чаще раза в 10 минут — иначе
// стоящая Mongo слала бы сообщение на каждой минуте тика.
const SCHEDULER_WARN_INTERVAL_MIN = 10;

@Injectable()
export class TelegramTeacherNotifier implements TeacherNotifier {
  private readonly logger = new Logger(TelegramTeacherNotifier.name);
  // Дедуп — в памяти инстанса, не в БД: при деплое, пока крутятся два
  // инстанса (старый ещё не остановлен), у каждого свой Map — учитель может
  // получить два DM за одно и то же окно в 10 минут. Это осознанная цена
  // (тот же компромисс, что at-least-once у доставок, ADR-0014), не баг —
  // RUNBOOK §8.10.
  private readonly lastSchedulerWarnAt = new Map<string, DateTime>();

  constructor(
    private readonly personalChats: PersonalChats,
    private readonly bot: TelegramBotService,
    @InjectModel(BroadcastRecord.name)
    private readonly broadcastModel: Model<BroadcastRecord>,
    @InjectModel(ChannelRecord.name) private readonly channelModel: Model<ChannelRecord>,
    @InjectModel(LessonRecord.name) private readonly lessonModel: Model<LessonRecord>,
    @InjectModel(ClassRecord.name) private readonly classModel: Model<ClassRecord>,
  ) {}

  async notifyDeliveryFailed(
    context: FailedDeliveryContext,
    now: DateTime,
  ): Promise<void> {
    const [name, channelTitle] = await Promise.all([
      this.broadcastName(context.broadcastId),
      this.channelTitle(context.channelId),
    ]);
    const text =
      `Не ушла рассылка «${name}» в канал «${channelTitle}»: ${context.error}. ` +
      'Проверьте канал на экране «Каналы» или отправьте вручную.';
    await this.broadcast(text, now);
  }

  async notifySchedulerFailed(
    step: string,
    _error: string,
    now: DateTime,
  ): Promise<void> {
    const last = this.lastSchedulerWarnAt.get(step);
    if (last && now.diff(last, 'minutes').minutes < SCHEDULER_WARN_INTERVAL_MIN) return;
    this.lastSchedulerWarnAt.set(step, now);
    // Причина ошибки — только в лог (errorMessage/errorStack у вызывающего
    // SchedulerService.step), в DM учителю сырое исключение не уходит
    // (CLAUDE.md «Ошибки»): он не программист, ему нужно «что делать».
    await this.broadcast(
      `Рассылки могли задержаться: не отработал шаг «${step}». Проверьте журнал ` +
        'рассылок; если повторится — напишите разработчику.',
      now,
    );
  }

  /** «класс выключен» и причины без сформулированного действия — `undefined`
   * от cancelledBroadcastMessage, DM не шлём (тихий отказ лучше, чем шум по
   * решению самого учителя, docs/PLAN.md §6). */
  async notifyBroadcastCancelled(
    context: CancelledBroadcastContext,
    now: DateTime,
  ): Promise<void> {
    const name = await this.broadcastName(context.broadcastId);
    const text = cancelledBroadcastMessage(context.reason, name);
    if (!text) return;
    await this.broadcast(text, now);
  }

  /** Все три уведомления этого класса (сбой доставки, сбой шага планировщика,
   * отмена рассылки) — один вид `delivery_failed`, «Пост не ушёл» (ТЗ
   * notifications-delivery.md §2): кто его выключил, тому не пишем, лог
   * остаётся собственным fallback-путём, если писать некому вовсе. */
  private async broadcast(text: string, now: DateTime): Promise<void> {
    const chats = await this.personalChats.listFor('delivery_failed', now);
    if (chats.length === 0) {
      this.logger.error(text);
      return;
    }
    await Promise.all(chats.map((chat) => this.bot.sendMessage(chat.chatId, text)));
  }

  /** «{название} {время}» — как в посте (broadcast-planner.render.ts): класс
   * занятия + время в его поясе. Без lessonId (разовая рассылка учителя) или
   * занятие/класс уже удалены — общее «Разовая рассылка» без времени. */
  private async broadcastName(broadcastId: string): Promise<string> {
    const broadcast = await this.broadcastModel
      .findById(broadcastId, { lessonId: 1, scheduledAt: 1 })
      .lean<{ lessonId?: Types.ObjectId; scheduledAt: Date } | null>();
    if (!broadcast?.lessonId) return 'Разовая рассылка';
    const lesson = await this.lessonModel
      .findById(broadcast.lessonId, { classId: 1 })
      .lean<{ classId: Types.ObjectId } | null>();
    const cls = lesson
      ? await this.classModel
          .findById(lesson.classId, { title: 1, tz: 1 })
          .lean<{ title: string; tz: string } | null>()
      : null;
    if (!cls) return 'Разовая рассылка';
    const time = DateTime.fromJSDate(broadcast.scheduledAt, { zone: 'utc' })
      .setZone(cls.tz || SCHOOL_TZ)
      .toFormat('HH:mm');
    return `${cls.title} ${time}`;
  }

  private async channelTitle(channelId: string): Promise<string> {
    const channel = await this.channelModel
      .findById(channelId, { title: 1 })
      .lean<{ title: string } | null>();
    return channel?.title ?? 'канал удалён';
  }
}
