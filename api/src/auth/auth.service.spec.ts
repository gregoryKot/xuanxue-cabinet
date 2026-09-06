import { DateTime } from 'luxon';
import { fakeConfig } from '../test-support/http-fakes';
import { AuthService } from './auth.service';

const SECRET = 'a'.repeat(32);
const NOW = DateTime.fromISO('2026-09-05T12:00:00Z');

describe('AuthService.issueSession', () => {
  it('токен проверяется тем же секретом и содержит userId', () => {
    const service = new AuthService(SECRET, fakeConfig('development'));
    const { token } = service.issueSession('u1', NOW);
    expect(service.verifySession(token, NOW)).toMatchObject({ sub: 'u1' });
  });

  it('в development cookie без Secure', () => {
    const service = new AuthService(SECRET, fakeConfig('development'));
    const { cookie } = service.issueSession('u1', NOW);
    expect(cookie).not.toContain('Secure');
  });

  it('в production cookie с Secure', () => {
    const service = new AuthService(SECRET, fakeConfig('production'));
    const { cookie } = service.issueSession('u1', NOW);
    expect(cookie).toContain('Secure');
  });
});

describe('AuthService.verifySession', () => {
  it('чужой секрет — null', () => {
    const service = new AuthService(SECRET, fakeConfig('development'));
    const other = new AuthService('b'.repeat(32), fakeConfig('development'));
    const { token } = other.issueSession('u1', NOW);
    expect(service.verifySession(token, NOW)).toBeNull();
  });
});

describe('AuthService.logoutCookie', () => {
  it('очищает cookie с Max-Age=0', () => {
    const service = new AuthService(SECRET, fakeConfig('production'));
    expect(service.logoutCookie()).toContain('Max-Age=0');
  });
});
