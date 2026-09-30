// Свой день напоминания об оплате (ADR-0160): «там у всех по-разному», поэтому
// день выбирает ученик, а час и включённость остаются за школой. Хранение —
// `notification_prefs.paymentReminderDay`, планировщик читает его в
// payment-reminder-candidates.ts. Владение — только по userId из сессии.
import { Injectable } from '@nestjs/common';
import {
  PAYMENT_REMINDER_DISABLED_MESSAGE,
  type MyPaymentReminderDto,
  type PaymentReminderSettings,
} from '@xuanxue/shared';
import { ConflictError } from '../common/errors';
import { NotificationPrefsService } from '../notifications/notification-prefs.service';
import { SettingsService } from '../settings/settings.service';

/** Что видит ученик. Школа напоминание не включила — `undefined`: экран не
 * покажет выбор дня, который ничего не делает (ADR-0069). */
export function toMyReminderDto(
  school: PaymentReminderSettings,
  ownDay: number | undefined,
): MyPaymentReminderDto | undefined {
  if (!school.enabled) return undefined;
  return {
    dayOfMonth: ownDay ?? school.dayOfMonth,
    isOwnDay: ownDay !== undefined,
    schoolDayOfMonth: school.dayOfMonth,
    time: school.time,
  };
}

@Injectable()
export class PaymentReminderDayService {
  constructor(
    private readonly prefs: NotificationPrefsService,
    private readonly settingsService: SettingsService,
  ) {}

  /** Для `GET /me/payments`: настройки школы уже прочитаны там же. Пока школа
   * напоминание не включила, в базу за днём ученика не ходим. */
  async forUser(
    userId: string,
    school: PaymentReminderSettings,
  ): Promise<MyPaymentReminderDto | undefined> {
    if (!school.enabled) return undefined;
    return toMyReminderDto(school, await this.prefs.getPaymentReminderDay(userId));
  }

  /** Записывает день (или сбрасывает `null`) и возвращает то, что теперь
   * увидит ученик: кабинет вписывает ответ без второго GET (ADR-0087). */
  async set(userId: string, dayOfMonth: number | null): Promise<MyPaymentReminderDto> {
    const { paymentReminder } = await this.settingsService.get();
    const dto = toMyReminderDto(paymentReminder, dayOfMonth ?? undefined);
    // Школа выключила — выбирать нечего, а значение, записанное «на потом»,
    // включилось бы у ученика молча вместе с включением школой.
    if (!dto) throw new ConflictError(PAYMENT_REMINDER_DISABLED_MESSAGE);
    await this.prefs.setPaymentReminderDay(userId, dayOfMonth);
    return dto;
  }
}
