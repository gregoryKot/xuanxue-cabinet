import { DateTime } from 'luxon';
import { SESSION_MAX_AGE_DAYS, signSession } from './session-token';
import { throttleTracker } from './throttle-tracker';

const SECRET = 'a'.repeat(32);
const OTHER_SECRET = 'b'.repeat(32);
const NOW = DateTime.utc(2026, 10, 1, 12, 0, 0);

function cookieFor(userId: string, secret = SECRET, issuedAt = NOW): string {
  return `session=${signSession({ userId, issuedAt }, secret)}`;
}

describe('throttleTracker', () => {
  it('валидная сессия — бакет по пользователю, IP не участвует', () => {
    const fromHome = throttleTracker(
      { ip: '10.0.0.1', headers: { cookie: cookieFor('u1') } },
      SECRET,
      NOW,
    );
    const fromSchool = throttleTracker(
      { ip: '10.0.0.2', headers: { cookie: cookieFor('u1') } },
      SECRET,
      NOW,
    );
    expect(fromHome).toBe('user:u1');
    expect(fromSchool).toBe('user:u1');
  });

  // Нагрузочный тест аудита 2026-10-01: десять учеников за одним NAT делили
  // один бакет и получали 429 на автосохранении с 65-й секунды.
  it('два вошедших за одним IP — два разных бакета', () => {
    const ip = '10.0.0.1';
    const a = throttleTracker({ ip, headers: { cookie: cookieFor('u1') } }, SECRET, NOW);
    const b = throttleTracker({ ip, headers: { cookie: cookieFor('u2') } }, SECRET, NOW);
    expect(a).not.toBe(b);
  });

  it('без cookie — по IP', () => {
    expect(throttleTracker({ ip: '10.0.0.1', headers: {} }, SECRET, NOW)).toBe(
      'ip:10.0.0.1',
    );
  });

  it('cookie с чужой подписью — по IP, свой бакет не даётся', () => {
    const req = { ip: '10.0.0.1', headers: { cookie: cookieFor('u1', OTHER_SECRET) } };
    expect(throttleTracker(req, SECRET, NOW)).toBe('ip:10.0.0.1');
  });

  it('протухшая сессия — по IP', () => {
    const stale = NOW.minus({ days: SESSION_MAX_AGE_DAYS + 1 });
    const req = { ip: '10.0.0.1', headers: { cookie: cookieFor('u1', SECRET, stale) } };
    expect(throttleTracker(req, SECRET, NOW)).toBe('ip:10.0.0.1');
  });

  it('cookie среди других cookie — сессия находится', () => {
    const cookie = `theme=dark; ${cookieFor('u1')}; other=1`;
    expect(throttleTracker({ ip: '10.0.0.1', headers: { cookie } }, SECRET, NOW)).toBe(
      'user:u1',
    );
  });

  it('IP не определён — ключ всё равно есть, не «undefined»', () => {
    expect(throttleTracker({ headers: {} }, SECRET, NOW)).toBe('ip:unknown');
  });
});
