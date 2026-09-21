// Чистая логика без Mongo и без DI (CLAUDE.md «Тесты») — образец веток, как
// у auth/session-token.spec.ts: нет cookie, чужая подпись, протухший токен,
// валидный токен, всё с явным `now`.
import { DateTime } from 'luxon';
import { SESSION_COOKIE } from '../auth/session-cookie';
import { SESSION_MAX_AGE_DAYS, signSession } from '../auth/session-token';
import { hasSignedSession } from './raw-body-session';
import type { IncomingRequestLike } from './raw-body-route';

const SECRET = 'a'.repeat(32);
const OTHER_SECRET = 'b'.repeat(32);
const NOW = DateTime.fromISO('2026-09-05T12:00:00Z', { setZone: true });

function reqWithCookie(cookie: string | string[] | undefined): IncomingRequestLike {
  return {
    method: 'POST',
    url: '/api/materials/507f1f77bcf86cd799439011/file',
    headers: { cookie },
  };
}

describe('hasSignedSession', () => {
  it('нет заголовка Cookie — false', () => {
    expect(hasSignedSession(reqWithCookie(undefined), SECRET, NOW)).toBe(false);
  });

  it('Cookie есть, но без session= — false', () => {
    expect(hasSignedSession(reqWithCookie('other=1'), SECRET, NOW)).toBe(false);
  });

  it('валидный токен тем же секретом — true', () => {
    const token = signSession({ userId: 'u1', issuedAt: NOW }, SECRET);
    expect(
      hasSignedSession(reqWithCookie(`${SESSION_COOKIE}=${token}`), SECRET, NOW),
    ).toBe(true);
  });

  it('токен подписан чужим секретом — false', () => {
    const token = signSession({ userId: 'u1', issuedAt: NOW }, OTHER_SECRET);
    expect(
      hasSignedSession(reqWithCookie(`${SESSION_COOKIE}=${token}`), SECRET, NOW),
    ).toBe(false);
  });

  it('протухший токен — false', () => {
    const issuedAt = NOW.minus({ days: SESSION_MAX_AGE_DAYS, seconds: 1 });
    const token = signSession({ userId: 'u1', issuedAt }, SECRET);
    expect(
      hasSignedSession(reqWithCookie(`${SESSION_COOKIE}=${token}`), SECRET, NOW),
    ).toBe(false);
  });

  it('битый токен (не 3 части) — false, не исключение', () => {
    expect(hasSignedSession(reqWithCookie(`${SESSION_COOKIE}=мусор`), SECRET, NOW)).toBe(
      false,
    );
  });

  it('заголовок-массив — читает первое значение (asSingleHeader)', () => {
    const token = signSession({ userId: 'u1', issuedAt: NOW }, SECRET);
    expect(
      hasSignedSession(reqWithCookie([`${SESSION_COOKIE}=${token}`]), SECRET, NOW),
    ).toBe(true);
  });
});
