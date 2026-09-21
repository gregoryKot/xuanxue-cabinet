// Устойчивость процесса (аудит 2026-09-21, HIGH «ошибки процесса не роняют
// и не маскируются»): без этого модуля ни один необработанный reject, ни
// одно исключение вне Nest-контекста нигде не ловились — в Node 22
// необработанный unhandledRejection валит процесс так же, как
// uncaughtException. Инстанс на Railway один, падение — простой всей школы
// до перезапуска. Два события ловятся по-разному: reject — не приговор
// (лог, процесс живёт дальше), исключение — само Node рекомендует не
// продолжать работу дальше, состояние процесса после него недостоверно,
// поэтому `onFatal()` (в main.ts — process.exit(1), Railway поднимет заново).
import { errorMessage, errorStack } from './error-info';

/** Минимальный интерфейс вместо NodeJS.Process — реальный `process` и
 * `EventEmitter` в тесте (process-guards.spec.ts) оба ему удовлетворяют, что
 * и делает функцию тестируемой без запуска настоящего процесса. */
export interface ProcessLike {
  on(event: 'unhandledRejection', listener: (reason: unknown) => void): unknown;
  on(event: 'uncaughtException', listener: (error: Error) => void): unknown;
}

/** Тот же контракт, что нужен здесь от `Logger` (nestjs-pino) — error-лог со
 * стеком, как и у остальных мест catch (CLAUDE.md «Логи»). */
export interface ErrorLogger {
  error(message: string, stack?: string): void;
}

// Префикс сообщения — по нему ищут строку в логах Railway (RUNBOOK §4,
// фильтр `level:50`), тот же приём, что `push.send: …` в push-sender.service.ts.
const UNHANDLED_REJECTION_TAG = 'process.unhandledRejection';
const UNCAUGHT_EXCEPTION_TAG = 'process.uncaughtException';

export function installProcessGuards(
  target: ProcessLike,
  logger: ErrorLogger,
  onFatal: () => void,
): void {
  target.on('unhandledRejection', (reason) => {
    logger.error(
      `${UNHANDLED_REJECTION_TAG}: ${errorMessage(reason)}`,
      errorStack(reason),
    );
    // Процесс НЕ падает: необработанный reject — сбой одного промиса, а не
    // повод ронять инстанс со всеми текущими запросами (аудит 2026-09-21).
  });
  target.on('uncaughtException', (error) => {
    logger.error(`${UNCAUGHT_EXCEPTION_TAG}: ${errorMessage(error)}`, errorStack(error));
    onFatal();
  });
}
