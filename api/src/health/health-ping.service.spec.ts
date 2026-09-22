// Юнит без Mongo и без HTTP (CLAUDE.md «Тесты»): connection и heartbeat —
// фейки прямо в конструктор (тот же приём, что push-sender.service.spec.ts),
// fetch подменяется на globalThis. Здоровье само (readyState/heartbeat →
// ok/degraded) уже покрыто health-outcome.spec.ts — здесь важно только «шлём
// пинг тогда и только тогда, когда healthOutcome() говорит ok, и никогда не
// роняем тик».
import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { DateTime } from 'luxon';
import { ConnectionStates } from 'mongoose';
import type { Connection } from 'mongoose';
import { SCHEDULER_STALE_MIN } from './health-outcome';
import { HealthPingService } from './health-ping.service';
import type { SchedulerHeartbeatReader } from '../common/scheduler-heartbeat';

const PING_URL = 'https://hc-ping.com/11111111-2222-3333-4444-555555555555';

function fakeConnection(readyState: ConnectionStates): Connection {
  return { readyState } as unknown as Connection;
}

function configFrom(values: Record<string, string | undefined>): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

function response(status: number): Response {
  return { ok: status >= 200 && status < 300, status } as Response;
}

const STALE_HEARTBEAT: SchedulerHeartbeatReader = {
  lastTickFinishedAt: DateTime.utc().minus({ minutes: SCHEDULER_STALE_MIN + 1 }),
  tickInFlightSince: null,
};

describe('HealthPingService.ping', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('здоров, адрес задан — пинг уходит ровно один раз, на тот самый адрес, с таймаутом', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(response(200));
    const service = new HealthPingService(
      fakeConnection(ConnectionStates.connected),
      configFrom({ HEARTBEAT_PING_URL: PING_URL }),
    );

    await service.ping();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] ?? [];
    expect(url).toBe(PING_URL);
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('адрес не задан — fetch не вызывался ни разу', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch');
    const service = new HealthPingService(
      fakeConnection(ConnectionStates.connected),
      configFrom({}),
    );

    await service.ping();

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('деградация: Mongo не connected — пинга нет', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch');
    const service = new HealthPingService(
      fakeConnection(ConnectionStates.disconnected),
      configFrom({ HEARTBEAT_PING_URL: PING_URL }),
    );

    await service.ping();

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('scheduler.stale === true — пинга нет', async () => {
    jest.spyOn(process, 'uptime').mockReturnValue((SCHEDULER_STALE_MIN + 1) * 60);
    const fetchSpy = jest.spyOn(globalThis, 'fetch');
    const service = new HealthPingService(
      fakeConnection(ConnectionStates.connected),
      configFrom({ HEARTBEAT_PING_URL: PING_URL }),
      STALE_HEARTBEAT,
    );

    await service.ping();

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('fetch отклонился ошибкой — метод не бросает, пишет warn без URL в тексте', async () => {
    jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('boom'));
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const service = new HealthPingService(
      fakeConnection(ConnectionStates.connected),
      configFrom({ HEARTBEAT_PING_URL: PING_URL }),
    );

    await expect(service.ping()).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('boom'));
    expect(JSON.stringify(warn.mock.calls)).not.toContain(PING_URL);
  });

  it('ответ не-2xx — warn со статусом, без броска и без URL в тексте', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(response(503));
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const service = new HealthPingService(
      fakeConnection(ConnectionStates.connected),
      configFrom({ HEARTBEAT_PING_URL: PING_URL }),
    );

    await expect(service.ping()).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('503'));
    expect(JSON.stringify(warn.mock.calls)).not.toContain(PING_URL);
  });
});
