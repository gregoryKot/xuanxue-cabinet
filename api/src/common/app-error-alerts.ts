// Порт уведомления о сбое — админу в Telegram (CLAUDE.md «Логи»: «ошибка,
// которую увидел пользователь, — всегда с error-логом и стеком на сервере»;
// отзыв владельца 2026-09-18 «а куда приходят ошибки?»). Две половины одного
// вопроса: неизвестная ошибка сервера (500, ADR-0053, зовёт
// DomainExceptionFilter) и сбой в браузере (ADR-0071, зовёт
// ClientErrorsService). Интерфейс живёт в common/, чтобы ни фильтр, ни модуль
// приёма не зависели от TelegramModule напрямую — иначе цикл модулей Nest
// (тот же приём, что deliveries/teacher-notifier.ts). Реализация —
// TelegramAppErrorAlerts (api/src/telegram/), провайдер по этому токену —
// TelegramModule.
import type { ClientErrorKind } from '@xuanxue/shared';
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

/** Сбой в браузере (ADR-0071). Текста исключения здесь нет вовсе — не «есть,
 * но не используем»: в лог его пишет ClientErrorsService, а порт, который
 * физически не получил строку, не может её отправить в Telegram. */
export interface ClientErrorAlertContext {
  requestId?: string;
  kind: ClientErrorKind;
  /** Адрес экрана, уже без query и обрезанный по длине. */
  path: string;
}

export interface AppErrorAlerts {
  /** `now` — параметром (CLAUDE.md «Время»): вызывающий код (фильтр) уже
   * держит момент, реализация не имеет права звать DateTime.utc() сама. */
  notifyServerError(context: AppErrorAlertContext, now: DateTime): Promise<void>;
  /** Тот же дедуп и тот же потолок, что у notifyServerError: телефон админа
   * один, и делить его между серверными и браузерными сбоями нужно одним
   * счётчиком, а не двумя независимыми. */
  notifyClientError(context: ClientErrorAlertContext, now: DateTime): Promise<void>;
}

export const APP_ERROR_ALERTS = Symbol('APP_ERROR_ALERTS');
