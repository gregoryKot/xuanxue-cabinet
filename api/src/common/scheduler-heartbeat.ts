// Порт «последний тик планировщика» (аудит 2026-09-21, MED, RUNBOOK §8 п.4):
// health должен видеть, жив ли SchedulerService.tick(), не подключая
// SchedulerModule целиком — тот тянет TelegramModule/ExamsModule и другие
// домены ради одного показателя. Тот же приём, что у AppErrorAlerts в этом же
// каталоге: интерфейс и токен — здесь, реализация (SchedulerHeartbeat) —
// в scheduler/scheduler-heartbeat.ts, провайдер по токену там же (в
// SchedulerModule, с exports). Читатель — HealthController, через
// `@Optional() @Inject(SCHEDULER_HEARTBEAT)`: без провайдера в графе (юнит-тест
// контроллера в отрыве от SchedulerModule) health обязан отвечать как раньше.
import type { DateTime } from 'luxon';

/** Только для чтения — пишут в heartbeat noteTickStarted/noteTickFinished
 * самого SchedulerHeartbeat, вызванные из SchedulerService.tick(). */
export interface SchedulerHeartbeatReader {
  /** Момент, когда последний тик завершился — успешно или с упавшим внутри
   * шагом (каждый шаг тика ловит свою ошибку сам, SchedulerService.step,
   * finally в tick() отмечает конец в любом случае). `null` — тик ни разу не
   * завершался с момента старта процесса. */
  readonly lastTickFinishedAt: DateTime | null;
  /** Момент начала тика, который ещё не завершился. `null` — тика в полёте
   * нет. */
  readonly tickInFlightSince: DateTime | null;
}

export const SCHEDULER_HEARTBEAT = Symbol('SCHEDULER_HEARTBEAT');
