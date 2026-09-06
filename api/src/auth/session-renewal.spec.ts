import { DateTime } from 'luxon';
import { SESSION_RENEW_AFTER_DAYS, shouldRenew } from './session-renewal';
import type { SessionPayload } from './session-token';

function payloadIssuedAt(iso: string): SessionPayload {
  return { sub: 'u1', iat: Math.floor(DateTime.fromISO(iso).toSeconds()), exp: 0 };
}

describe('shouldRenew', () => {
  it('свежий токен (только что выдан) — не перевыпускать', () => {
    const now = DateTime.fromISO('2026-09-05T12:00:00Z');
    expect(shouldRenew(payloadIssuedAt('2026-09-05T12:00:00Z'), now)).toBe(false);
  });

  it('ровно на границе SESSION_RENEW_AFTER_DAYS — ещё не перевыпускать', () => {
    const issuedAt = '2026-09-05T12:00:00Z';
    const now = DateTime.fromISO(issuedAt).plus({ days: SESSION_RENEW_AFTER_DAYS });
    expect(shouldRenew(payloadIssuedAt(issuedAt), now)).toBe(false);
  });

  it('на день больше границы — перевыпустить', () => {
    const issuedAt = '2026-09-05T12:00:00Z';
    const now = DateTime.fromISO(issuedAt).plus({
      days: SESSION_RENEW_AFTER_DAYS,
      seconds: 1,
    });
    expect(shouldRenew(payloadIssuedAt(issuedAt), now)).toBe(true);
  });
});
