// Чистая логика без Nest (CLAUDE.md «Любой код с логикой приезжает с
// тестом» — уровень «чистая логика»): `new SchedulerHeartbeat()` напрямую,
// без Test.createTestingModule.
import { DateTime } from 'luxon';
import { SchedulerHeartbeat } from './scheduler-heartbeat';

describe('SchedulerHeartbeat', () => {
  it('изначально нет ни завершённого, ни тика в полёте', () => {
    const heartbeat = new SchedulerHeartbeat();

    expect(heartbeat.lastTickFinishedAt).toBeNull();
    expect(heartbeat.tickInFlightSince).toBeNull();
  });

  it('noteTickStarted помечает тик в полёте, не трогая lastTickFinishedAt', () => {
    const heartbeat = new SchedulerHeartbeat();
    const startedAt = DateTime.utc(2026, 9, 21, 12, 0, 0);

    heartbeat.noteTickStarted(startedAt);

    expect(heartbeat.tickInFlightSince).toBe(startedAt);
    expect(heartbeat.lastTickFinishedAt).toBeNull();
  });

  it('noteTickFinished переносит момент в lastTickFinishedAt и снимает тик в полёте', () => {
    const heartbeat = new SchedulerHeartbeat();
    const startedAt = DateTime.utc(2026, 9, 21, 12, 0, 0);
    const finishedAt = startedAt.plus({ seconds: 5 });

    heartbeat.noteTickStarted(startedAt);
    heartbeat.noteTickFinished(finishedAt);

    expect(heartbeat.lastTickFinishedAt).toBe(finishedAt);
    expect(heartbeat.tickInFlightSince).toBeNull();
  });

  it('следующий тик перезаписывает предыдущий lastTickFinishedAt', () => {
    const heartbeat = new SchedulerHeartbeat();
    const first = DateTime.utc(2026, 9, 21, 12, 0, 0);
    const second = first.plus({ minutes: 1 });

    heartbeat.noteTickStarted(first);
    heartbeat.noteTickFinished(first);
    heartbeat.noteTickStarted(second);

    // Тик в полёте — new lastTickFinishedAt ещё старый, tickInFlightSince уже новый.
    expect(heartbeat.lastTickFinishedAt).toBe(first);
    expect(heartbeat.tickInFlightSince).toBe(second);

    heartbeat.noteTickFinished(second);
    expect(heartbeat.lastTickFinishedAt).toBe(second);
    expect(heartbeat.tickInFlightSince).toBeNull();
  });
});
