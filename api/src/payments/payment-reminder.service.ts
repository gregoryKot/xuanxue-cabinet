// «Напоминание об оплате» — шаг тика планировщика (ADR-0051, ADR-0150, ADR-0161).
// Час общий, день у каждого свой: пока ни одно число месяца не в окне суток
// (openReminderDays), тик не делает ни одного запроса за учениками. Получатели —
// payment-reminder-candidates.ts. Идемпотентность — upsert документа оплаты по
// уникальному (userId, month) и claimAndRun по `reminderSentAt`: второй тик,
// второй инстанс и повтор после падения получают false и молчат (CLAUDE.md
// «Доставка идемпотентна»).
//
// Канал — «в тот, где человек есть»: личный чат бота, а нет его или бот не
// смог доставить (заблокирован, чат удалён) — строка ленты кабинета и push.
// Почта снята ADR-0061, резерв теперь лента: она не требует от ученика
// ничего сверх обычного входа (CLAUDE.md «Ноль нагрузки на ученика»).
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { DateTime } from 'luxon';
import { Types, type Model } from 'mongoose';
import type { SettingsDto } from '@xuanxue/shared';
import { claimAndRun } from '../common/claim-once';
import { errorMessage, errorStack } from '../common/error-info';
import { writeNotificationRow } from '../notifications/in-app-staff-write';
import { NotificationPrefsService } from '../notifications/notification-prefs.service';
import { NotificationRecord } from '../notifications/notification.schema';
import { PushSenderService } from '../push/push-sender.service';
import { SettingsService } from '../settings/settings.service';
import { PersonalChats } from '../telegram/personal-chats';
import { TelegramBotService } from '../telegram/telegram-bot.service';
import type { ActiveStudent } from '../users/list-active-students';
import { UserRecord } from '../users/user.schema';
import { findReminderCandidates, PAYMENT_DUE_KIND } from './payment-reminder-candidates';
import { buildPaymentReminderText } from './payment-reminder-text';
import { openReminderDays } from './payment-reminder-due';
import { monthKeyOf } from './payment-month';
import { PaymentRecord } from './payment.schema';
import { upsertPaymentByFilter } from './payments.write';

export interface PaymentReminderResult {
  reminded: number;
}

@Injectable()
export class PaymentReminderService {
  private readonly logger = new Logger(PaymentReminderService.name);

  constructor(
    @InjectModel(PaymentRecord.name) private readonly paymentModel: Model<PaymentRecord>,
    @InjectModel(UserRecord.name) private readonly userModel: Model<UserRecord>,
    @InjectModel(NotificationRecord.name)
    private readonly notificationModel: Model<NotificationRecord>,
    private readonly notificationPrefsService: NotificationPrefsService,
    private readonly settingsService: SettingsService,
    private readonly personalChats: PersonalChats,
    private readonly bot: TelegramBotService,
    private readonly pushSender: PushSenderService,
  ) {}

  async remind(now: DateTime): Promise<PaymentReminderResult> {
    const settings = await this.settingsService.get();
    const { enabled, dayOfMonth, time } = settings.paymentReminder;
    const open = enabled ? openReminderDays(now, settings.tz, time) : new Set<number>();
    if (open.size === 0) return { reminded: 0 };
    const month = monthKeyOf(now, settings.tz);
    let reminded = 0;
    const candidates = await findReminderCandidates(
      {
        userModel: this.userModel,
        paymentModel: this.paymentModel,
        notificationPrefsService: this.notificationPrefsService,
        logger: this.logger,
      },
      month,
      { open, schoolDay: dayOfMonth },
    );
    for (const student of candidates) {
      // Свой try/catch на человека: сбой на одном не должен каждый тик
      // упираться в него же и не пускать остальных (тот же довод, что у
      // DeliveryRunnerService.run).
      try {
        if (await this.remindOne(student, month, settings, now)) reminded += 1;
      } catch (error) {
        this.logger.error(
          `Напоминание об оплате не ушло: userId=${student.id} month=${month}: ${errorMessage(error)}`,
          errorStack(error),
        );
      }
    }
    return { reminded };
  }

  private async remindOne(
    student: ActiveStudent,
    month: string,
    settings: SettingsDto,
    now: DateTime,
  ): Promise<boolean> {
    // Документ оплаты нужен как цель claim: у ученика, который ни разу
    // ничего не присылал, его ещё нет. `$setOnInsert` не трогает существующий.
    const doc = await upsertPaymentByFilter(
      this.paymentModel,
      { userId: new Types.ObjectId(student.id), month },
      { $setOnInsert: { status: 'unpaid' } },
    );
    // Свежий статус из ответа upsert: оплату могли отметить после выборки
    // кандидатов. Между этим чтением и claim остаётся окно в миллисекунды
    // (claimOnce ставит отметку по одному `reminderSentAt`, не по статусу):
    // цена гонки — одно лишнее напоминание тому, кто как раз заплатил.
    if (doc.status === 'paid' || doc.reminderSentAt) return false;

    const text = buildPaymentReminderText({
      template: settings.paymentReminder.template,
      name: student.name,
      month,
      amountMinor: doc.amountMinor,
      botUsername: this.bot.botUsername(),
      contact: settings.paymentContact,
    });
    return claimAndRun(
      this.paymentModel,
      doc._id,
      'reminderSentAt',
      now,
      async () => {
        await this.deliver(student.id, text, month, now);
        return true;
      },
      (error) =>
        this.logger.error(
          `Напоминание об оплате упало после claim: userId=${student.id} month=${month}: ${errorMessage(error)}`,
          errorStack(error),
        ),
    );
  }

  private async deliver(
    userId: string,
    text: string,
    month: string,
    now: DateTime,
  ): Promise<void> {
    const chat = await this.personalChats.chatFor(userId, PAYMENT_DUE_KIND);
    if (chat && (await this.bot.sendMessage(chat.chatId, text))) return;
    // Чата нет или бот не доставил — строка ленты и push: сбой не теряется, а
    // переезжает в канал, где человек точно есть (повтора у Telegram нет, ADR-0150).
    await writeNotificationRow(this.notificationModel, {
      userId,
      kind: PAYMENT_DUE_KIND,
      paymentMonth: month,
    });
    // Push никогда не бросает (PushSenderService.sendToUser, ADR-0092).
    await this.pushSender.sendToUser(userId, now);
  }
}
