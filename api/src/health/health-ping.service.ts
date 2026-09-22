// «Кнопка жизни» (dead man's switch, ADR-0112): бесплатный внешний опрос раз
// в минуту с уведомлением в Telegram недостижим (docs/adr/0111 — тот же
// вывод про письмо раз в 5 минут), а планировщик и так тикает раз в минуту —
// значит, кабинет сам пингует внешний сервис (healthchecks.io и совместимые)
// после каждого здорового тика, и молчание дольше его grace period само
// поднимает тревогу учителю. Здоровье — та же чистая функция healthOutcome
// (health-outcome.ts), которой пользуется HealthController: readyState Mongo
// и heartbeat планировщика, а не факт «процесс жив» — иначе живой, но
// деградировавший инстанс молча считался бы здоровым, ровно то, от чего
// защищает /api/health (RUNBOOK §2).
import { Injectable, Inject, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectConnection } from '@nestjs/mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { Connection } from 'mongoose';
import { errorMessage } from '../common/error-info';
import {
  SCHEDULER_HEARTBEAT,
  type SchedulerHeartbeatReader,
} from '../common/scheduler-heartbeat';
import { buildHealthOutcome } from './health-outcome';

// Таймаут пинга (check-outbound-timeout.mjs требует signal у каждого fetch,
// CLAUDE.md «Храповики») — короткий: тик идёт раз в минуту, зависший без
// таймаута запрос копился бы с каждым следующим.
const HEARTBEAT_PING_TIMEOUT_MS = 5_000;

@Injectable()
export class HealthPingService {
  private readonly logger = new Logger(HealthPingService.name);

  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly config: ConfigService,
    // @Optional(): без SchedulerModule на пути (юнит-тесты этого сервиса)
    // heartbeat остаётся undefined — тот же приём, что в HealthController
    // (health-outcome.ts, SchedulerHealthInput).
    @Optional()
    @Inject(SCHEDULER_HEARTBEAT)
    private readonly heartbeat?: SchedulerHeartbeatReader,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async ping(): Promise<void> {
    const url = this.config.get<string>('HEARTBEAT_PING_URL');
    if (!url) return;

    const outcome = buildHealthOutcome(this.connection.readyState, {
      schedulerEnabledSetting: this.config.get<string>('SCHEDULER_ENABLED'),
      heartbeat: this.heartbeat,
      uptimeSec: Math.floor(process.uptime()),
    });
    // Деградация — пинга нет и не должно быть: молчание снаружи и есть сигнал
    // «прод болен», сам смысл dead man's switch (ADR-0112).
    if (outcome.status !== 'ok') return;

    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(HEARTBEAT_PING_TIMEOUT_MS),
      });
      if (!res.ok) {
        // Без url в сообщении — он несёт секретный идентификатор проверки,
        // тот же уровень секретности, что у путей в redact-paths.ts.
        this.logger.warn(`health.ping: кнопка жизни ответила ${res.status}`);
      }
    } catch (err) {
      this.logger.warn(`health.ping: пинг кнопки жизни не удался: ${errorMessage(err)}`);
    }
  }
}
