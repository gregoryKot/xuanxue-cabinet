// Реализация AppErrorAlerts поверх бота: сбой уходит в личные чаты —
// PersonalChats.listFor('app_error', now), лог остаётся fallback-путём, если
// писать некому (тот же приём, что TelegramTeacherNotifier.broadcast).
// Провайдер по токену APP_ERROR_ALERTS — TelegramModule.
//
// Дедуп и общий потолок — обязательны: без них цикл ошибок (упавшая Mongo,
// зависший внешний сервис) превратил бы телефон админа в будильник. Сбой
// сервера (ADR-0053) и сбой в браузере (ADR-0071) делят и то и другое: телефон
// у админа один, и два независимых счётчика дали бы вдвое больший будильник.
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { DateTime } from 'luxon';
import type {
  AppErrorAlertContext,
  AppErrorAlerts,
  ClientErrorAlertContext,
} from '../common/app-error-alerts';
import { alertSignaturePath } from '../common/request-info';
import { appErrorAlertMessage, clientErrorAlertMessage } from './app-error-alert-message';
import { PersonalChats } from './personal-chats';
import { TelegramBotService } from './telegram-bot.service';

// Та же сигнатура (метод + путь-шаблон без идентификаторов, alertSignaturePath)
// повторно не будит админа чаще раза в 10 минут — иначе зависший провайдер
// или упавшая база слали бы сообщение на каждый следующий запрос с тем же путём.
const SAME_SIGNATURE_INTERVAL_MIN = 10;
// Доставка не удалась ни одному чату (Telegram 429/таймаут, аудит 2026-10-01,
// F36): бюджет часа возвращаем, а повтор той же сигнатуры разрешаем через
// минуту, не сразу — при лежащем Telegram одна сигнатура даёт не больше одного
// исходящего вызова в минуту, а не на каждую 500.
const RETRY_AFTER_FAILURE_MIN = 1;
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
    private readonly config: ConfigService,
  ) {}

  async notifyServerError(context: AppErrorAlertContext, now: DateTime): Promise<void> {
    await this.send(
      `${context.method} ${alertSignaturePath(context.path)}`,
      appErrorAlertMessage(context, this.config.get<string>('PUBLIC_URL')),
      now,
    );
  }

  /** Сигнатура начинается с вида сбоя, а не с метода HTTP: браузерный сбой на
   * `/exams` и серверная 500 на том же адресе — разные события и не должны
   * гасить друг друга дедупом. */
  async notifyClientError(
    context: ClientErrorAlertContext,
    now: DateTime,
  ): Promise<void> {
    await this.send(
      `${context.kind} ${alertSignaturePath(context.path)}`,
      clientErrorAlertMessage(context, this.config.get<string>('PUBLIC_URL')),
      now,
    );
  }

  private async send(signature: string, text: string, now: DateTime): Promise<void> {
    if (this.isTooSoon(signature, now)) return;
    if (!this.tryConsumeHourlyBudget(now)) return;
    this.lastSentAtBySignature.set(signature, now);

    const chats = await this.personalChats.listFor('app_error', now);
    if (chats.length === 0) {
      this.logger.error(text);
      return;
    }
    const delivered = await Promise.all(
      chats.map((chat) => this.bot.sendMessage(chat.chatId, text)),
    );
    if (delivered.some(Boolean)) return;
    // sendMessage сам не бросает (bot-send-safely.ts) — `false` на каждый чат
    // и есть недоставка. Текст — в error-лог: RUNBOOK ищет сбой по requestId.
    this.hourlyCount -= 1;
    this.lastSentAtBySignature.set(
      signature,
      now.minus({ minutes: SAME_SIGNATURE_INTERVAL_MIN - RETRY_AFTER_FAILURE_MIN }),
    );
    this.logger.error(
      `app_error alert: доставка не удалась ни одному из ${delivered.length} чатов; ${text}`,
    );
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
