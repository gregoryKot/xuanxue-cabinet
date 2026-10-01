// Общий ход шага тика «сообщить ученикам о занятии» — для «Занятие отменено» и
// «Запись занятия» (ADR-0162, п. 4). Событие случилось в запросе учителя (отмена
// PATCH-ом, запись PATCH/POST-ом или от бота), а ленту и push ученикам пишет не
// он, а тик: запрос не тормозит и не падает из-за чужой доставки, а сбой записи
// у одного человека догоняют следующие тики в окне повторов
// (`LESSON_NOTICE_WINDOW_HOURS`) — тихий отказ рассылки самая дорогая ошибка
// (CLAUDE.md «Логи»). Наследник говорит только, какой вид пишет и какие занятия
// выбрать (`findLessons`); получатели, «уже сообщили» и доставка — здесь, одни
// на оба вида, а не две копии, которые разойдутся на первой правке (CLAUDE.md
// «Одна механика — один компонент», jscpd).
//
// Получатели — активные ученики с включённым видом, о занятиях по их выбору
// (LessonRecipientsService, общий с «Занятием скоро»). «Уже сообщили» — строка
// ленты с уникальным индексом (userId, kind, lessonId), push уходит только тому,
// чей вызов строку вставил (`insertRowAndPush`): два тика или два инстанса при
// деплое не пришлют дубль, а строки других видов того же занятия не мешают —
// вид входит в ключ.
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { DateTime } from 'luxon';
import type { Model } from 'mongoose';
import type { NotificationKind } from '@xuanxue/shared';
import { ClassRecord } from '../classes/class.schema';
import { LessonRecipientsService } from '../notifications/lesson-recipients.service';
import { NotificationRecord } from '../notifications/notification.schema';
import { PushSenderService } from '../push/push-sender.service';
import { LessonRecord } from './lesson.schema';
import { insertRowAndPush } from './lesson-notice-delivery';
import { planLessonNotices, type PlannedLessonNotice } from './lesson-notice-plan';
import { existingLessonRowKeys, type PlanLesson } from './lesson-notice-queries';

export interface LessonNoticeResult {
  /** Сколько строк ленты вставлено (а значит, людей, которым ушёл push). */
  notified: number;
}

@Injectable()
export abstract class LessonNoticeStep {
  protected readonly logger = new Logger(this.constructor.name);
  /** Вид строки ленты, которую пишет шаг. */
  protected abstract readonly kind: NotificationKind;
  /** «Что не записано» для строки лога: «об отмене занятия», «о записи занятия». */
  protected abstract readonly what: string;

  constructor(
    @InjectModel(LessonRecord.name) protected readonly lessonModel: Model<LessonRecord>,
    @InjectModel(ClassRecord.name) protected readonly classModel: Model<ClassRecord>,
    @InjectModel(NotificationRecord.name)
    private readonly notificationModel: Model<NotificationRecord>,
    private readonly lessonRecipients: LessonRecipientsService,
    private readonly pushSender: PushSenderService,
  ) {}

  /** Занятия в окне повторов, о которых этому виду есть что сообщить. */
  protected abstract findLessons(now: DateTime): Promise<PlanLesson[]>;

  async announce(now: DateTime): Promise<LessonNoticeResult> {
    // Занятия первыми: обычный тик не находит ни одного события и на этом
    // заканчивается одним запросом, без поиска получателей.
    const lessons = await this.findLessons(now);
    if (lessons.length === 0) return { notified: 0 };
    const { recipients, prefs } = await this.lessonRecipients.findFor(this.kind);
    if (recipients.length === 0) return { notified: 0 };
    const existing = await existingLessonRowKeys(
      this.notificationModel,
      this.kind,
      recipients.map((r) => r.id),
      lessons.map((l) => l.id),
    );

    const planned = planLessonNotices({ lessons, recipients, prefs, existing });
    const sent = await Promise.all(planned.map((item) => this.notifyOne(item, now)));
    return { notified: sent.filter(Boolean).length };
  }

  /** Один человек, одно занятие: строка ленты и push — `insertRowAndPush`. */
  private notifyOne(
    { userId, lessonId, lessonTitle, lessonStartsAt }: PlannedLessonNotice,
    now: DateTime,
  ): Promise<boolean> {
    return insertRowAndPush(
      { model: this.notificationModel, pushSender: this.pushSender, logger: this.logger },
      { userId, kind: this.kind, lessonId, lessonTitle, lessonStartsAt },
      now,
      `Уведомление ${this.what} ${lessonId} для ${userId}`,
    );
  }
}
