import { DateTime } from 'luxon';
import { AuthService } from './auth.service';
import { sessionCookieProfile } from './session-cookie';
import { SESSION_RENEW_AFTER_DAYS } from './session-renewal';
import { SESSION_MAX_AGE_SEC } from './session-token';

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

describe('AuthService.activeSessionCookie', () => {
  const EXPECTED = {
    production: { name: 'session', domain: 'Domain=xuanxue.su', secure: true },
    staging: {
      name: 'session_staging',
      domain: 'Domain=staging.xuanxue.su',
      secure: true,
    },
    local: { name: 'session', domain: null, secure: false },
  } as const;

  it.each(Object.keys(EXPECTED) as (keyof typeof EXPECTED)[])(
    '%s — одно поле с именем профиля, проверяемый токен, без уборки host-only',
    (profile) => {
      const auth = service(profile);
      const field = auth.activeSessionCookie('u1', NOW);
      const expected = EXPECTED[profile];
      const [pair = '', ...attrs] = field.split('; ');

      expect(field).not.toContain('Max-Age=0');
      expect(attrs).toContain(`Max-Age=${SESSION_MAX_AGE_SEC}`);
      expect(pair.startsWith(`${expected.name}=`)).toBe(true);
      expect(attrs.includes('Secure')).toBe(expected.secure);
      expect(attrs.find((attr) => attr.startsWith('Domain='))).toBe(
        expected.domain ?? undefined,
      );
      expect(auth.verifyCookieHeader(pair, NOW)).toMatchObject({ sub: 'u1' });
    },
  );
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

describe('AuthService.readSession', () => {
  it('отдаёт тот же токен, что в cookie, и его нагрузку', () => {
    const auth = service('production');
    const { token } = auth.issueSession('u1', NOW);
    const session = auth.readSession(`a=1; session=${token}`, NOW);
    expect(session?.token).toBe(token);
    expect(session?.payload).toMatchObject({ sub: 'u1' });
    expect(auth.verifyCookieHeader(`session=${token}`, NOW)).toEqual(session?.payload);
  });

  it('нет cookie, повтор или чужая подпись — null', () => {
    const auth = service('production');
    const { token } = auth.issueSession('u1', NOW);
    const foreign = service('production', 'b'.repeat(32)).issueSession('u1', NOW).token;
    expect(auth.readSession(undefined, NOW)).toBeNull();
    expect(auth.readSession(`session=${token}; session=${token}`, NOW)).toBeNull();
    expect(auth.readSession(`session=${foreign}`, NOW)).toBeNull();
  });
});

describe('AuthService.sharedSessionCookies', () => {
  const DAY_SEC = 24 * 60 * 60;

  function sharedFor(profile: keyof typeof PUBLIC_URLS, now: DateTime) {
    const auth = service(profile);
    const { token } = auth.issueSession('u1', NOW);
    const name = profile === 'staging' ? 'session_staging' : 'session';
    const session = auth.readSession(`${name}=${token}`, now);
    if (!session) throw new Error('сессия не прочиталась');
    return { token, cookies: auth.sharedSessionCookies(session, now) };
  }

  it('до порога продления — тот же токен с остатком срока, прежняя host-only гаснет первой', () => {
    const { token, cookies } = sharedFor('production', NOW.plus({ days: 1 }));
    expect(cookies).toEqual([
      'session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0; Secure',
      `session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_MAX_AGE_SEC - DAY_SEC}; Domain=xuanxue.su; Secure`,
    ]);
  });

  it('после порога — новый токен на полный срок, как продление в гварде', () => {
    const now = NOW.plus({ days: SESSION_RENEW_AFTER_DAYS + 1 });
    const { token, cookies } = sharedFor('production', now);
    expect(cookies).toHaveLength(2);
    expect(cookies[0]).toMatch(/^session=; .*Max-Age=0/);
    const fresh = /^session=([^;]+); .*Max-Age=(\d+); /.exec(cookies[1] ?? '');
    expect(fresh?.[1]).not.toBe(token);
    expect(fresh?.[2]).toBe(String(SESSION_MAX_AGE_SEC));
    expect(
      service('production').verifyCookieHeader(`session=${fresh?.[1]}`, now),
    ).toMatchObject({ sub: 'u1', iat: Math.floor(now.toSeconds()) });
  });

  it('стейджинг — session_staging на своём домене, локально — одно поле', () => {
    const staging = sharedFor('staging', NOW.plus({ days: 1 })).cookies;
    expect(staging).toHaveLength(2);
    expect(staging[1]).toMatch(/^session_staging=.*Domain=staging\.xuanxue\.su; Secure$/);
    expect(sharedFor('local', NOW.plus({ days: 1 })).cookies).toHaveLength(1);
  });
});

describe('AuthService.wikiOrigin', () => {
  it('wiki окружения по профилю, локально — null', () => {
    expect(service('production').wikiOrigin()).toBe('https://wiki.xuanxue.su');
    expect(service('staging').wikiOrigin()).toBe('https://wiki.staging.xuanxue.su');
    expect(service('local').wikiOrigin()).toBeNull();
  });
});

describe('AuthService.logoutCookies', () => {
  it('гасит cookie с Max-Age=0', () => {
    for (const cookie of service('production').logoutCookies()) {
      expect(cookie).toContain('Max-Age=0');
    }
  });
});
