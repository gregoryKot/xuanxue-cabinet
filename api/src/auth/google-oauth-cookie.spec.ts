// Юнит-тест cookie google_oauth (google-oauth-cookie.ts) — build/read/clear
// без HTTP.
import {
  buildGoogleOAuthCookie,
  clearGoogleOAuthCookie,
  GOOGLE_OAUTH_COOKIE,
  readGoogleOAuthCookie,
} from './google-oauth-cookie';

const PAYLOAD = {
  state: 's'.repeat(43),
  verifier: 'v'.repeat(43),
  nonce: 'n'.repeat(22),
};

describe('buildGoogleOAuthCookie', () => {
  it('HttpOnly, SameSite=Lax, Path сужен до потока, без Secure вне production', () => {
    const cookie = buildGoogleOAuthCookie(PAYLOAD, { secure: false });
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/api/auth/google');
    expect(cookie).toContain('Max-Age=600');
    expect(cookie).not.toContain('Secure');
  });

  it('Secure — только когда явно передан secure: true (production)', () => {
    expect(buildGoogleOAuthCookie(PAYLOAD, { secure: true })).toContain('Secure');
  });
});

describe('readGoogleOAuthCookie — читает то, что построил buildGoogleOAuthCookie', () => {
  it('без join', () => {
    const cookie = buildGoogleOAuthCookie(PAYLOAD, { secure: false });
    const header = cookie.split(';')[0];
    expect(readGoogleOAuthCookie(header)).toEqual(PAYLOAD);
  });

  it('с join', () => {
    const withJoin = { ...PAYLOAD, join: 'a'.repeat(32) };
    const cookie = buildGoogleOAuthCookie(withJoin, { secure: false });
    const header = cookie.split(';')[0];
    expect(readGoogleOAuthCookie(header)).toEqual(withJoin);
  });
});

describe('readGoogleOAuthCookie — отказы', () => {
  it('заголовка нет — null', () => {
    expect(readGoogleOAuthCookie(undefined)).toBeNull();
  });

  it('cookie нет в заголовке — null', () => {
    expect(readGoogleOAuthCookie('other=1')).toBeNull();
  });

  it('битый base64url — null', () => {
    expect(readGoogleOAuthCookie(`${GOOGLE_OAUTH_COOKIE}=не-base64!!!`)).toBeNull();
  });

  it('валидный base64url, но не JSON — null', () => {
    const notJson = Buffer.from('не json').toString('base64url');
    expect(readGoogleOAuthCookie(`${GOOGLE_OAUTH_COOKIE}=${notJson}`)).toBeNull();
  });

  it('JSON, но не объект — null', () => {
    const arr = Buffer.from('[1,2,3]').toString('base64url');
    expect(readGoogleOAuthCookie(`${GOOGLE_OAUTH_COOKIE}=${arr}`)).toBeNull();
  });

  it.each(['state', 'verifier', 'nonce'])(
    'без обязательного поля %s — null',
    (missing) => {
      const partial: Record<string, unknown> = { ...PAYLOAD };
      delete partial[missing];
      const value = Buffer.from(JSON.stringify(partial)).toString('base64url');
      expect(readGoogleOAuthCookie(`${GOOGLE_OAUTH_COOKIE}=${value}`)).toBeNull();
    },
  );

  it('join не строка — null', () => {
    const bad = { ...PAYLOAD, join: 123 };
    const value = Buffer.from(JSON.stringify(bad)).toString('base64url');
    expect(readGoogleOAuthCookie(`${GOOGLE_OAUTH_COOKIE}=${value}`)).toBeNull();
  });
});

describe('clearGoogleOAuthCookie', () => {
  it('Max-Age=0, тот же Path, значение пустое', () => {
    const cookie = clearGoogleOAuthCookie();
    expect(cookie).toContain('Max-Age=0');
    expect(cookie).toContain('Path=/api/auth/google');
    expect(cookie).toContain(`${GOOGLE_OAUTH_COOKIE}=;`);
  });
});
