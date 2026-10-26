// Юнит-тест общей части cookie заявки OAuth (oauth-state-cookie.ts) — build/
// read/clear без HTTP. Поля конкретного провайдера проверяют google-oauth-
// cookie.spec.ts и telegram-oidc-cookie.spec.ts.
import {
  buildOAuthCookie,
  clearOAuthCookie,
  readOAuthCookie,
  type OAuthCookieSpec,
} from './oauth-state-cookie';

const SPEC: OAuthCookieSpec = { name: 'demo_oauth', path: '/api/auth/demo' };

function headerFor(value: string): string {
  return `${SPEC.name}=${Buffer.from(value).toString('base64url')}`;
}

describe('buildOAuthCookie', () => {
  it('HttpOnly, SameSite=Lax, Path из spec, Max-Age=600, без Secure вне production', () => {
    const cookie = buildOAuthCookie(SPEC, { a: 1 }, { secure: false });
    expect(cookie).toContain('demo_oauth=');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/api/auth/demo');
    expect(cookie).toContain('Max-Age=600');
    expect(cookie).not.toContain('Secure');
  });

  it('Secure — только когда передан secure: true', () => {
    expect(buildOAuthCookie(SPEC, {}, { secure: true })).toContain('Secure');
  });
});

describe('readOAuthCookie', () => {
  it('читает то, что построил buildOAuthCookie', () => {
    const cookie = buildOAuthCookie(SPEC, { state: 's', join: 'j' }, { secure: false });
    expect(readOAuthCookie(SPEC, cookie.split(';')[0])).toEqual({
      state: 's',
      join: 'j',
    });
  });

  it('находит cookie среди других в одном заголовке', () => {
    const own = buildOAuthCookie(SPEC, { state: 's' }, { secure: false }).split(';')[0];
    expect(readOAuthCookie(SPEC, `session=abc; ${own}`)).toEqual({ state: 's' });
  });

  it('заголовка нет — null', () => {
    expect(readOAuthCookie(SPEC, undefined)).toBeNull();
  });

  it('cookie нет в заголовке — null', () => {
    expect(readOAuthCookie(SPEC, 'other=1')).toBeNull();
  });

  it('cookie другого провайдера не читается', () => {
    const other = buildOAuthCookie(
      { name: 'other_oauth', path: '/x' },
      { state: 's' },
      { secure: false },
    ).split(';')[0];
    expect(readOAuthCookie(SPEC, other)).toBeNull();
  });

  it('битый base64url — null', () => {
    expect(readOAuthCookie(SPEC, `${SPEC.name}=не-base64!!!`)).toBeNull();
  });

  it('валидный base64url, но не JSON — null', () => {
    expect(readOAuthCookie(SPEC, headerFor('не json'))).toBeNull();
  });

  it.each([['[1,2,3]'], ['null'], ['"строка"'], ['7']])(
    'JSON %s — не объект, null',
    (json) => {
      expect(readOAuthCookie(SPEC, headerFor(json))).toBeNull();
    },
  );
});

describe('clearOAuthCookie', () => {
  it('Max-Age=0, тот же Path, значение пустое', () => {
    const cookie = clearOAuthCookie(SPEC);
    expect(cookie).toContain('Max-Age=0');
    expect(cookie).toContain('Path=/api/auth/demo');
    expect(cookie).toContain(`${SPEC.name}=;`);
  });
});
