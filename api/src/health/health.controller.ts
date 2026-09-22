import { Controller, Get, Inject, Optional, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectConnection } from '@nestjs/mongoose';
import { SkipThrottle } from '@nestjs/throttler';
import type { Connection } from 'mongoose';
import pkg from '../../package.json';
import { Public } from '../auth/auth.decorators';
import {
  SCHEDULER_HEARTBEAT,
  type SchedulerHeartbeatReader,
} from '../common/scheduler-heartbeat';
import { buildHealthOutcome } from './health-outcome';
import { shortCommitSha } from './health-commit';

export interface HealthStatus {
  status: 'ok' | 'degraded';
  version: string;
  /** Короткий SHA коммита, из которого собран образ — только там, где задан
   * RAILWAY_GIT_COMMIT_SHA (Railway, docker-смок CI); локально отсутствует
   * (RUNBOOK §2 п.1: «версия новая» непроверяема одним `version` из
   * package.json, который в проде не меняется). */
  commit?: string;
  mongo: 'up' | 'down';
  uptimeSec: number;
  /** Аудит 2026-09-21 (MED, RUNBOOK §8 п.4): признаки жизни планировщика —
   * без них зависший без таймаута тик выглядел бы как ok навсегда. */
  scheduler: {
    enabled: boolean;
    lastTickFinishedAt: string | null;
    stale: boolean;
  };
}

// Только код ответа — не весь ResponseLike (common/http-headers.ts): тому
// нужен setHeader для cookie, здесь ничего, кроме статуса, не меняется.
interface HealthResponseLike {
  status(code: number): unknown;
}

// Вне троттлинга и вне автологов nestjs-pino (см. logging.module.ts) —
// Railway и мониторинг дёргают этот путь каждую минуту. @Public() — без
// него AuthGuard требовал бы сессию, а мониторинг её не имеет (SECURITY §3:
// единственные исключения из-под гварда — health и вебхук).
@Public()
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly config: ConfigService,
    // @Optional(): без SchedulerModule на пути (юнит-тесты этого контроллера)
    // health обязан отвечать как раньше — см. SchedulerHealthInput в
    // health-outcome.ts: heartbeat === null никогда не даёт stale: true.
    @Optional()
    @Inject(SCHEDULER_HEARTBEAT)
    private readonly heartbeat?: SchedulerHeartbeatReader,
  ) {}

  // 503 при недоступной Mongo или зависшем планировщике — тем же телом, не
  // конвертом ошибок (ApiErrorBody): health читают люди и Railway, которому
  // важен только код ответа (RUNBOOK §2 — трафик переключается после
  // успешного GET). Поэтому код ответа выставляется через
  // @Res({ passthrough: true }), а не бросок DomainError/HttpException —
  // тело остаётся HealthStatus как есть.
  @Get()
  check(@Res({ passthrough: true }) res: HealthResponseLike): HealthStatus {
    const uptimeSec = Math.floor(process.uptime());
    const outcome = buildHealthOutcome(this.connection.readyState, {
      schedulerEnabledSetting: this.config.get<string>('SCHEDULER_ENABLED'),
      heartbeat: this.heartbeat,
      uptimeSec,
    });
    res.status(outcome.httpStatus);
    return {
      status: outcome.status,
      version: pkg.version,
      commit: shortCommitSha(this.config.get<string>('RAILWAY_GIT_COMMIT_SHA')),
      mongo: outcome.mongo,
      uptimeSec,
      scheduler: outcome.scheduler,
    };
  }
}
