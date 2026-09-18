// Порт уведомления о неизвестной ошибке сервера (500) — админу в Telegram
// (CLAUDE.md «Логи»: «ошибка, которую увидел пользователь, — всегда с
// error-логом и стеком на сервере»; отзыв владельца 2026-09-18 «а куда
// приходят ошибки?»). Интерфейс живёт в common/, чтобы
// DomainExceptionFilter не зависел от TelegramModule напрямую — иначе цикл
// модулей Nest (тот же приём, что deliveries/teacher-notifier.ts).
// Реализация — TelegramAppErrorAlerts (api/src/telegram/), провайдер по
// этому токену — TelegramModule.
import type { DateTime } from 'luxon';

export interface AppErrorAlertContext {
  requestId?: string;
  method: string;
  /** Без query-строки — там бывают токены входа (SECURITY §6). */
  path: string;
  /** Текст исключения — только для лога сервера (его уже пишет
   * DomainExceptionFilter): реализация НЕ имеет права класть его в текст
   * сообщения (CLAUDE.md «Ошибки» — наружу текст исключения не уходит). */
  message: string;
}

export interface AppErrorAlerts {
  /** `now` — параметром (CLAUDE.md «Время»): вызывающий код (фильтр) уже
   * держит момент, реализация не имеет права звать DateTime.utc() сама. */
  notifyServerError(context: AppErrorAlertContext, now: DateTime): Promise<void>;
}

export const APP_ERROR_ALERTS = Symbol('APP_ERROR_ALERTS');
