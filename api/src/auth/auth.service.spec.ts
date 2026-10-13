import { DateTime } from 'luxon';
import { AuthService } from './auth.service';
import { sessionCookieProfile } from './session-cookie';

const SECRET = 'a'.repeat(32);
const NOW = DateTime.fromISO('2026-09-05T12:00:00Z');

const PUBLIC_URLS = {
  production: 'https://xuanxue.su',
  staging: 'https://staging.xuanxue.su',
  local: 'http://localhost:3000',
} as const;

function service(
  profile: keyof typeof PUBLIC_URLS = 'local',
  secret = SECRET,
): AuthService {
  return new AuthService(secret, sessionCookieProfile(PUBLIC_URLS[profile]));
}

describe('AuthService.issueSession', () => {
  it('токен проверяется тем же секретом и содержит userId', () => {
    const auth = service();
    const { token } = auth.issueSession('u1', NOW);
    expect(auth.verifyCookieHeader(`session=${token}`, NOW)).toMatchObject({ sub: 'u1' });
  });

  it('локально — одно поле без Secure', () => {
    const { cookies } = service('local').issueSession('u1', NOW);
    expect(cookies).toHaveLength(1);
    expect(cookies[0]).not.toContain('Secure');
  });

  it('в проде — уборка host-only session и общая cookie с Secure', () => {
    const { token, cookies } = service('production').issueSession('u1', NOW);
    expect(cookies).toHaveLength(2);
    expect(cookies[0]).toMatch(/^session=; .*Max-Age=0/);
    expect(cookies[1]).toMatch(
      new RegExp(`^session=${token}; .*Domain=xuanxue\\.su; Secure$`),
    );
  });
});

describe('AuthService.verifyCookieHeader', () => {
  it('чужой секрет — null', () => {
    const { token } = service('local', 'b'.repeat(32)).issueSession('u1', NOW);
    expect(service().verifyCookieHeader(`session=${token}`, NOW)).toBeNull();
  });

  it('две cookie session — null, даже если обе подписаны верно', () => {
    const auth = service('production');
    const { token } = auth.issueSession('u1', NOW);
    expect(auth.verifyCookieHeader(`session=${token}; session=${token}`, NOW)).toBeNull();
  });

  it('стейджинг читает только session_staging', () => {
    const auth = service('staging');
    const { token } = auth.issueSession('u1', NOW);
    expect(auth.verifyCookieHeader(`session=${token}`, NOW)).toBeNull();
    expect(auth.verifyCookieHeader(`session_staging=${token}`, NOW)).toMatchObject({
      sub: 'u1',
    });
  });

  it('токен другого окружения под своим именем не проходит подпись', () => {
    const { token } = service('production', 'p'.repeat(32)).issueSession('u1', NOW);
    const staging = service('staging', 's'.repeat(32));
    expect(staging.verifyCookieHeader(`session_staging=${token}`, NOW)).toBeNull();
  });

  it('без заголовка — null', () => {
    expect(service().verifyCookieHeader(undefined, NOW)).toBeNull();
  });
});

describe('AuthService.logoutCookies', () => {
  it('гасит cookie с Max-Age=0', () => {
    for (const cookie of service('production').logoutCookies()) {
      expect(cookie).toContain('Max-Age=0');
    }
  });
});
