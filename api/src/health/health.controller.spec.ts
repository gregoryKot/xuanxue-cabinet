import { Test } from '@nestjs/testing';
import type { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getConnectionToken } from '@nestjs/mongoose';
import { DateTime } from 'luxon';
import { HealthController } from './health.controller';
import {
  SCHEDULER_HEARTBEAT,
  type SchedulerHeartbeatReader,
} from '../common/scheduler-heartbeat';
import pkg from '../../package.json';

// Фейк вместо ResponseLike (common/http-headers.ts): контроллеру здоровья
// нужен только status(), а не весь набор для cookie — см. HealthResponseLike
// в health.controller.ts.
function fakeStatusResponse(): { status: jest.Mock; code: number | undefined } {
  const state: { status: jest.Mock; code: number | undefined } = {
    status: jest.fn(),
    code: undefined,
  };
  state.status.mockImplementation((code: number) => {
    state.code = code;
  });
  return state;
}

interface BuildOptions {
  readyState: number;
  railwayCommitSha?: string;
  schedulerEnabled?: 'true' | 'false';
  heartbeat?: SchedulerHeartbeatReader;
}

async function buildController(options: BuildOptions): Promise<HealthController> {
  // Ключи разведены явно (не один общий `get: () => x`, как раньше) — теперь
  // контроллер читает и RAILWAY_GIT_COMMIT_SHA, и SCHEDULER_ENABLED, и им
  // нужны независимые значения (аудит 2026-09-21, MED).
  const configValues: Record<string, string | undefined> = {
    RAILWAY_GIT_COMMIT_SHA: options.railwayCommitSha,
    SCHEDULER_ENABLED: options.schedulerEnabled,
  };
  const providers: Provider[] = [
    { provide: getConnectionToken(), useValue: { readyState: options.readyState } },
    { provide: ConfigService, useValue: { get: (key: string) => configValues[key] } },
  ];
  // Провайдер SCHEDULER_HEARTBEAT кладём только когда он явно нужен теста —
  // остальные тесты бьют по ветке `@Optional()` (SchedulerModule не на пути).
  if (options.heartbeat) {
    providers.push({ provide: SCHEDULER_HEARTBEAT, useValue: options.heartbeat });
  }
  const module = await Test.createTestingModule({
    controllers: [HealthController],
    providers,
  }).compile();
  return module.get(HealthController);
}

describe('HealthController', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('mongo: up, readyState === 1 — status ok, код 200', async () => {
    const controller = await buildController({ readyState: 1 });
    const res = fakeStatusResponse();
    expect(controller.check(res)).toMatchObject({ status: 'ok', mongo: 'up' });
    expect(res.code).toBe(200);
  });

  it('mongo: down, соединение не готово — status degraded, код 503', async () => {
    const controller = await buildController({ readyState: 0 });
    const res = fakeStatusResponse();
    expect(controller.check(res)).toMatchObject({ status: 'degraded', mongo: 'down' });
    expect(res.code).toBe(503);
  });

  it('версия берётся из package.json', async () => {
    const controller = await buildController({ readyState: 1 });
    expect(controller.check(fakeStatusResponse()).version).toBe(pkg.version);
  });

  it('uptimeSec — неотрицательное целое число', async () => {
    const controller = await buildController({ readyState: 1 });
    const { uptimeSec } = controller.check(fakeStatusResponse());
    expect(Number.isInteger(uptimeSec)).toBe(true);
    expect(uptimeSec).toBeGreaterThanOrEqual(0);
  });

  it('RAILWAY_GIT_COMMIT_SHA задан — commit: первые 7 символов', async () => {
    const controller = await buildController({
      readyState: 1,
      railwayCommitSha: 'a1b2c3d4e5f6789',
    });
    expect(controller.check(fakeStatusResponse()).commit).toBe('a1b2c3d');
  });

  it('RAILWAY_GIT_COMMIT_SHA не задан (локальный запуск) — commit undefined', async () => {
    // JSON.stringify выкидывает ключ со значением undefined из тела ответа
    // (её и видит клиент) — здесь проверяется значение до сериализации,
    // «поле отсутствует в HTTP-ответе» — health.e2e-spec.ts.
    const controller = await buildController({ readyState: 1 });
    expect(controller.check(fakeStatusResponse()).commit).toBeUndefined();
  });

  // Аудит 2026-09-21 (MED, RUNBOOK §8 п.4): без SchedulerModule на пути
  // (обычный юнит-тест этого контроллера) @Optional() отдаёт undefined —
  // health обязан отвечать как раньше, не «протухшим» без единого признака.
  it('без SCHEDULER_HEARTBEAT в графе — scheduler.stale всегда false', async () => {
    const controller = await buildController({ readyState: 1 });
    const { scheduler } = controller.check(fakeStatusResponse());
    expect(scheduler).toEqual({ enabled: true, lastTickFinishedAt: null, stale: false });
  });

  it('SCHEDULER_ENABLED=false — scheduler.enabled false, даже если heartbeat протух', async () => {
    jest.spyOn(process, 'uptime').mockReturnValue(1000);
    const heartbeat: SchedulerHeartbeatReader = {
      lastTickFinishedAt: DateTime.utc().minus({ minutes: 30 }),
      tickInFlightSince: null,
    };
    const controller = await buildController({
      readyState: 1,
      schedulerEnabled: 'false',
      heartbeat,
    });
    const res = fakeStatusResponse();
    const body = controller.check(res);
    expect(body).toMatchObject({ status: 'ok' });
    // lastTickFinishedAt — реальные данные heartbeat, а не null: `enabled`
    // влияет только на stale, само значение поля не подменяется.
    expect(body.scheduler).toEqual({
      enabled: false,
      lastTickFinishedAt: heartbeat.lastTickFinishedAt?.toISO() ?? null,
      stale: false,
    });
    expect(res.code).toBe(200);
  });

  it('планировщик завис дольше порога — 503, degraded, scheduler.stale true', async () => {
    jest.spyOn(process, 'uptime').mockReturnValue(1000);
    const lastTickFinishedAt = DateTime.utc().minus({ minutes: 30 });
    const heartbeat: SchedulerHeartbeatReader = {
      lastTickFinishedAt,
      tickInFlightSince: null,
    };
    const controller = await buildController({ readyState: 1, heartbeat });
    const res = fakeStatusResponse();
    const body = controller.check(res);
    expect(body).toMatchObject({ status: 'degraded' });
    expect(body.scheduler).toEqual({
      enabled: true,
      lastTickFinishedAt: lastTickFinishedAt.toISO(),
      stale: true,
    });
    expect(res.code).toBe(503);
  });
});
