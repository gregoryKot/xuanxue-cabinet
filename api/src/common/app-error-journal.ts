// Порт журнала сбоев (ADR-0132): текст ошибки раньше жил только в логах
// Railway, экран «Сбои» (роль `admin`, подписана «Разработчик» в интерфейсе)
// читает его отсюда. Тот же приём, что AppErrorAlerts рядом — интерфейс в
// common/, чтобы ни DomainExceptionFilter, ни ClientErrorsService не
// зависели от AppErrorsModule напрямую (иначе цикл модулей Nest, тот же
// повод, что у deliveries/teacher-notifier.ts).
import type { DateTime } from 'luxon';
import type { AppErrorKind, AppErrorSource } from '@xuanxue/shared';

export interface AppErrorJournalEntry {
  requestId?: string;
  source: AppErrorSource;
  kind: AppErrorKind;
  /** Только у серверного сбоя (метод HTTP). */
  method?: string;
  /** Адрес экрана или путь запроса — без query (SECURITY §6, вызывающий код
   * уже вырезал её через pathWithoutQuery). */
  path: string;
  text: string;
  userAgent?: string;
}

export interface AppErrorJournal {
  /** Не имеет права бросить исключение наружу (CLAUDE.md «Ошибки»):
   * вызывающий код (фильтр, ClientErrorsService) зовёт fire-and-forget и сам
   * ловит `.catch()`, но и реализация обязана пережить отказ базы сама —
   * второй сбой не должен родиться из попытки записать первый.
   * `now` — параметром (CLAUDE.md «Время»), реализация не имеет права звать
   * DateTime.utc() сама. */
  record(entry: AppErrorJournalEntry, now: DateTime): Promise<void>;
}

export const APP_ERROR_JOURNAL = Symbol('APP_ERROR_JOURNAL');
