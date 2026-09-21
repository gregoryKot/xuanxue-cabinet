// Чистая функция без Nest и без Mongo (CLAUDE.md «Любой код с логикой
// приезжает с тестом» — уровень «чистая логика»): решает, что ответить,
// зная только readyState соединения и снимок heartbeat планировщика. Единая
// точка, где статус текста и HTTP-код связаны с готовностью Mongo и с тем,
// не завис ли планировщик — контроллер сам не решает.
import { HttpStatus } from '@nestjs/common';
import { ConnectionStates } from 'mongoose';
import type { DateTime } from 'luxon';
import type { HealthStatus } from './health.controller';

// Аудит 2026-09-21 (MED): будущий тик без таймаута может зависнуть —
// `waitForCompletion: true` молча пропускает все следующие тики
// (SchedulerService.tick), а /api/health отвечал бы ok, пока кто-то не
// заглянет в uptimeSec руками (RUNBOOK §8 п.4). Порог один — и на «тик давно
// не завершался», и на «тик висит», и на грейс-период старта процесса.
export const SCHEDULER_STALE_MIN = 5;

export interface SchedulerHealthInput {
  /** Реальная настройка SCHEDULER_ENABLED — идёт в ответ как есть, даже если
   * heartbeat ниже недоступен. */
  enabled: boolean;
  /** `null` — провайдера SchedulerHeartbeat нет в этом DI-графе (юнит-тест
   * HealthController в отрыве от SchedulerModule, `@Optional()` в
   * health.controller.ts): протухшим планировщик в таком случае не считаем —
   * судить не по чему, а не «наверняка сломан». Не путать со значениями
   * `null` внутри самого heartbeat — те означают «тик ни разу не завершался»
   * и «тика в полёте нет» соответственно, и это законные рабочие состояния. */
  heartbeat: {
    lastTickFinishedAt: DateTime | null;
    tickInFlightSince: DateTime | null;
  } | null;
  now: DateTime;
  uptimeSec: number;
}

export interface HealthOutcome {
  httpStatus: number;
  status: HealthStatus['status'];
  mongo: HealthStatus['mongo'];
  scheduler: HealthStatus['scheduler'];
}

function schedulerIsStale(input: SchedulerHealthInput): boolean {
  if (!input.enabled || !input.heartbeat) return false;
  // Грейс-период: процесс младше порога — первый тик ещё не должен был
  // случиться, отсутствие lastTickFinishedAt здесь не авария (иначе каждый
  // деплой на первых минутах показывал бы degraded).
  if (input.uptimeSec <= SCHEDULER_STALE_MIN * 60) return false;
  const { lastTickFinishedAt, tickInFlightSince } = input.heartbeat;
  const finishedStale =
    !lastTickFinishedAt ||
    input.now.diff(lastTickFinishedAt, 'minutes').minutes > SCHEDULER_STALE_MIN;
  const inFlightStale =
    !!tickInFlightSince &&
    input.now.diff(tickInFlightSince, 'minutes').minutes > SCHEDULER_STALE_MIN;
  return finishedStale || inFlightStale;
}

// Railway переключает трафик только после успешного GET /api/health
// (RUNBOOK §2) — пока Mongo не готова или планировщик завис, инстанс не
// должен выглядеть здоровым, иначе трафик уедет на инстанс, где рассылки не
// уходят.
export function healthOutcome(
  readyState: ConnectionStates,
  scheduler: SchedulerHealthInput,
): HealthOutcome {
  const isMongoUp = readyState === ConnectionStates.connected;
  const stale = schedulerIsStale(scheduler);
  const isHealthy = isMongoUp && !stale;
  return {
    httpStatus: isHealthy ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE,
    status: isHealthy ? 'ok' : 'degraded',
    mongo: isMongoUp ? 'up' : 'down',
    scheduler: {
      enabled: scheduler.enabled,
      lastTickFinishedAt: scheduler.heartbeat?.lastTickFinishedAt?.toISO() ?? null,
      stale,
    },
  };
}
