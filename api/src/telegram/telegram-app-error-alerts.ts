// Реализация AppErrorAlerts поверх бота: неизвестная ошибка сервера (500)
// уходит в личные чаты — PersonalChats.listFor('app_error', now), лог
// остаётся fallback-путём, если писать некому (тот же приём, что
// TelegramTeacherNotifier.broadcast). Провайдер по токену APP_ERROR_ALERTS —
// TelegramModule.
//
// Дедуп и общий потолок — обязательны: без них цикл ошибок (упавшая Mongo,
// зависший внешний сервис) превратил бы телефон админа в будильник.
import { Injectable, Logger } from '@nestjs/common';
import type { DateTime } from 'luxon';
import type { AppErrorAlertContext, AppErrorAlerts } from '../common/app-error-alerts';
import { appErrorAlertMessage } from './app-error-alert-message';
import { PersonalChats } from './personal-chats';
import { TelegramBotService } from './telegram-bot.service';

// Та же сигнатура (метод+путь) повторно не будит админа чаще раза в 10
// минут — иначе зависший провайдер или упавшая база слали бы сообщение на
// каждый следующий запрос с тем же путём.
const SAME_SIGNATURE_INTERVAL_MIN = 10;
// Общий потолок на случай нескольких разных сигнатур сразу (несколько
// маршрутов посыпались одновременно): не больше шести сообщений в час суммарно.
const HOURLY_LIMIT = 6;
const HOURLY_WINDOW_MIN = 60;

@Injectable()
export class TelegramAppErrorAlerts implements AppErrorAlerts {
  private readonly logger = new Logger(TelegramAppErrorAlerts.name);
  // Дедуп — в памяти инстанса, не в БД: при деплое, пока крутятся два
  // инстанса (старый ещё не остановлен), у каждого свой Map и свой счётчик
  // часа — админ может получить лишний алёрт на границе деплоя. Осознанная
  // цена (тот же компромисс, что у TelegramTeacherNotifier.lastSchedulerWarnAt,
  // ADR-0014, RUNBOOK §8.10), не баг.
  private readonly lastSentAtBySignature = new Map<string, DateTime>();
  private hourlyWindowStart: DateTime | null = null;
  private hourlyCount = 0;
  private hourlyLimitLoggedForWindow = false;

  constructor(
    private readonly personalChats: PersonalChats,
    private readonly bot: TelegramBotService,
  ) {}

  async notifyServerError(context: AppErrorAlertContext, now: DateTime): Promise<void> {
    const signature = `${context.method} ${context.path}`;
    if (this.isTooSoon(signature, now)) return;
    if (!this.tryConsumeHourlyBudget(now)) return;
    this.lastSentAtBySignature.set(signature, now);

    const text = appErrorAlertMessage(context);
    const chats = await this.personalChats.listFor('app_error', now);
    if (chats.length === 0) {
      this.logger.error(text);
      return;
    }
    await Promise.all(chats.map((chat) => this.bot.sendMessage(chat.chatId, text)));
  }

  private isTooSoon(signature: string, now: DateTime): boolean {
    const last = this.lastSentAtBySignature.get(signature);
    return !!last && now.diff(last, 'minutes').minutes < SAME_SIGNATURE_INTERVAL_MIN;
  }

  /** true — можно слать, счётчик часа учтён. false — потолок исчерпан:
   * молчим до конца окна, в лог — один раз на окно (иначе сам потолок шумел
   * бы на каждый следующий сбой). */
  private tryConsumeHourlyBudget(now: DateTime): boolean {
    const windowExpired =
      !this.hourlyWindowStart ||
      now.diff(this.hourlyWindowStart, 'minutes').minutes >= HOURLY_WINDOW_MIN;
    if (windowExpired) {
      this.hourlyWindowStart = now;
      this.hourlyCount = 0;
      this.hourlyLimitLoggedForWindow = false;
    }
    if (this.hourlyCount >= HOURLY_LIMIT) {
      if (!this.hourlyLimitLoggedForWindow) {
        this.hourlyLimitLoggedForWindow = true;
        this.logger.error(
          `app_error: потолок ${HOURLY_LIMIT} сообщений в час исчерпан, молчим до конца часа.`,
        );
      }
      return false;
    }
    this.hourlyCount += 1;
    return true;
  }
}
