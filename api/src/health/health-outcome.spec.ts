import { DateTime } from 'luxon';
import { ConnectionStates } from 'mongoose';
import {
  healthOutcome,
  SCHEDULER_STALE_MIN,
  type SchedulerHealthInput,
} from './health-outcome';

const NOW = DateTime.utc(2026, 9, 21, 12, 0, 0);
// Дольше грейс-периода старта — иначе «протухший» тик не отличить от «процесс
// только что поднялся» (см. baseScheduler ниже).
const UPTIME_SEC = (SCHEDULER_STALE_MIN + 1) * 60;

function baseScheduler(
  overrides: Partial<SchedulerHealthInput> = {},
): SchedulerHealthInput {
  return {
    enabled: true,
    heartbeat: { lastTickFinishedAt: NOW, tickInFlightSince: null },
    now: NOW,
    uptimeSec: UPTIME_SEC,
    ...overrides,
  };
}

describe('healthOutcome', () => {
  it('Mongo подключена, планировщик тикает вовремя — 200, ok, up, scheduler не протух', () => {
    expect(healthOutcome(ConnectionStates.connected, baseScheduler())).toEqual({
      httpStatus: 200,
      status: 'ok',
      mongo: 'up',
      scheduler: { enabled: true, lastTickFinishedAt: NOW.toISO(), stale: false },
    });
  });

  it('Mongo не готова (любой readyState, кроме connected) — 503, degraded, down', () => {
    for (const readyState of [
      ConnectionStates.disconnected,
      ConnectionStates.connecting,
      ConnectionStates.disconnecting,
      ConnectionStates.uninitialized,
    ]) {
      expect(healthOutcome(readyState, baseScheduler())).toMatchObject({
        httpStatus: 503,
        status: 'degraded',
        mongo: 'down',
      });
    }
  });

  describe('scheduler.stale', () => {
    it('тик не завершался дольше порога — stale, 503, degraded', () => {
      const heartbeat = {
        lastTickFinishedAt: NOW.minus({ minutes: SCHEDULER_STALE_MIN + 1 }),
        tickInFlightSince: null,
      };
      const outcome = healthOutcome(
        ConnectionStates.connected,
        baseScheduler({ heartbeat }),
      );
      expect(outcome).toMatchObject({ httpStatus: 503, status: 'degraded' });
      expect(outcome.scheduler.stale).toBe(true);
    });

    it('тик ни разу не завершался (heartbeat есть, lastTickFinishedAt null) — stale', () => {
      const heartbeat = { lastTickFinishedAt: null, tickInFlightSince: null };
      const outcome = healthOutcome(
        ConnectionStates.connected,
        baseScheduler({ heartbeat }),
      );
      expect(outcome.scheduler.stale).toBe(true);
    });

    it('тик в полёте дольше порога — stale, даже если предыдущий тик завершился вовремя', () => {
      const heartbeat = {
        lastTickFinishedAt: NOW.minus({ minutes: 1 }),
        tickInFlightSince: NOW.minus({ minutes: SCHEDULER_STALE_MIN + 1 }),
      };
      const outcome = healthOutcome(
        ConnectionStates.connected,
        baseScheduler({ heartbeat }),
      );
      expect(outcome.scheduler.stale).toBe(true);
    });

    it('тик завершился недавно — не stale, 200, ok', () => {
      const heartbeat = {
        lastTickFinishedAt: NOW.minus({ minutes: 1 }),
        tickInFlightSince: null,
      };
      const outcome = healthOutcome(
        ConnectionStates.connected,
        baseScheduler({ heartbeat }),
      );
      expect(outcome).toEqual({
        httpStatus: 200,
        status: 'ok',
        mongo: 'up',
        scheduler: {
          enabled: true,
          lastTickFinishedAt: heartbeat.lastTickFinishedAt.toISO(),
          stale: false,
        },
      });
    });

    it('планировщик выключен (SCHEDULER_ENABLED=false) — не stale, даже если тик давно не завершался', () => {
      const heartbeat = {
        lastTickFinishedAt: NOW.minus({ hours: 3 }),
        tickInFlightSince: null,
      };
      const outcome = healthOutcome(
        ConnectionStates.connected,
        baseScheduler({ enabled: false, heartbeat }),
      );
      expect(outcome).toMatchObject({ httpStatus: 200, status: 'ok' });
      // lastTickFinishedAt — реальные данные heartbeat, а не null: `enabled`
      // влияет только на stale, само значение поля не подменяется.
      expect(outcome.scheduler).toEqual({
        enabled: false,
        lastTickFinishedAt: heartbeat.lastTickFinishedAt.toISO(),
        stale: false,
      });
    });

    it('ранний старт процесса (uptime меньше порога) — не stale, даже без единого тика', () => {
      const heartbeat = { lastTickFinishedAt: null, tickInFlightSince: null };
      const outcome = healthOutcome(
        ConnectionStates.connected,
        baseScheduler({ heartbeat, uptimeSec: SCHEDULER_STALE_MIN * 60 - 1 }),
      );
      expect(outcome).toMatchObject({ httpStatus: 200, status: 'ok' });
      expect(outcome.scheduler.stale).toBe(false);
    });

    it('нет провайдера SchedulerHeartbeat (heartbeat: null) — не stale, судить не по чему', () => {
      const outcome = healthOutcome(
        ConnectionStates.connected,
        baseScheduler({ heartbeat: null }),
      );
      expect(outcome).toMatchObject({ httpStatus: 200, status: 'ok' });
      expect(outcome.scheduler).toEqual({
        enabled: true,
        lastTickFinishedAt: null,
        stale: false,
      });
    });
  });
});
