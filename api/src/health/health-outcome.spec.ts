import { ConnectionStates } from 'mongoose';
import { healthOutcome } from './health-outcome';

describe('healthOutcome', () => {
  it('Mongo подключена (readyState connected) — 200, ok, up', () => {
    expect(healthOutcome(ConnectionStates.connected)).toEqual({
      httpStatus: 200,
      status: 'ok',
      mongo: 'up',
    });
  });

  it('Mongo не готова (любой readyState, кроме connected) — 503, degraded, down', () => {
    for (const readyState of [
      ConnectionStates.disconnected,
      ConnectionStates.connecting,
      ConnectionStates.disconnecting,
      ConnectionStates.uninitialized,
    ]) {
      expect(healthOutcome(readyState)).toEqual({
        httpStatus: 503,
        status: 'degraded',
        mongo: 'down',
      });
    }
  });
});
