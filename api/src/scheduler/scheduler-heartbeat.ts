// Чистый класс без внешних зависимостей (CLAUDE.md «Любой код с логикой
// приезжает с тестом» — уровень «чистая логика», spec без Nest): хранит
// момент начала и конца последнего тика планировщика. SchedulerService.tick()
// зовёт noteTickStarted/noteTickFinished, HealthController читает результат
// через порт SchedulerHeartbeatReader (common/scheduler-heartbeat.ts), не
// зная про сам SchedulerService. Аудит 2026-09-21 (MED): будущий тик без
// таймаута может зависнуть — `waitForCompletion: true` молча пропускает все
// следующие тики, а /api/health отвечал бы `ok`, пока кто-то не заглянет в
// uptimeSec руками (RUNBOOK §8 п.4).
import { Injectable } from '@nestjs/common';
import type { DateTime } from 'luxon';
import type { SchedulerHeartbeatReader } from '../common/scheduler-heartbeat';

@Injectable()
export class SchedulerHeartbeat implements SchedulerHeartbeatReader {
  private tickStartedAt: DateTime | null = null;
  private tickFinishedAt: DateTime | null = null;

  get lastTickFinishedAt(): DateTime | null {
    return this.tickFinishedAt;
  }

  get tickInFlightSince(): DateTime | null {
    return this.tickStartedAt;
  }

  /** Зовётся в начале SchedulerService.tick(), до самого тика. */
  noteTickStarted(now: DateTime): void {
    this.tickStartedAt = now;
  }

  /** Зовётся в finally SchedulerService.tick() — и после успешного тика, и
   * после упавшего шага (шаги ловят свои ошибки сами, но finally страхует и
   * будущий код, который бросит мимо SchedulerService.step()). */
  noteTickFinished(now: DateTime): void {
    this.tickFinishedAt = now;
    this.tickStartedAt = null;
  }
}
