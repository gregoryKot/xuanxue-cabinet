// Юнит-тест cookie telegram_oauth (telegram-oidc-cookie.ts) — поля Telegram;
// общую часть (атрибуты, битый JSON) проверяет oauth-state-cookie.spec.ts.
import {
  buildTelegramOAuthCookie,
  clearTelegramOAuthCookie,
  readTelegramOAuthCookie,
  TELEGRAM_OAUTH_COOKIE,
} from './telegram-oidc-cookie';

const PAYLOAD = { state: 's'.repeat(43), verifier: 'v'.repeat(43) };

function headerFor(payload: Record<string, unknown>): string {
  const value = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${TELEGRAM_OAUTH_COOKIE}=${value}`;
}

describe('buildTelegramOAuthCookie', () => {
  it('HttpOnly, SameSite=Lax, Path сужен до OIDC-потока, Max-Age=600, без Secure вне production', () => {
    const cookie = buildTelegramOAuthCookie(PAYLOAD, { secure: false });
    expect(cookie.startsWith(`${TELEGRAM_OAUTH_COOKIE}=`)).toBe(true);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/api/auth/telegram/oidc');
    expect(cookie).toContain('Max-Age=600');
    expect(cookie).not.toContain('Secure');
  });

  it('Secure — когда передан secure: true (production)', () => {
    expect(buildTelegramOAuthCookie(PAYLOAD, { secure: true })).toContain('Secure');
  });
});

describe('readTelegramOAuthCookie — читает то, что построил buildTelegramOAuthCookie', () => {
  it('без join', () => {
    const header = buildTelegramOAuthCookie(PAYLOAD, { secure: false }).split(';')[0];
    expect(readTelegramOAuthCookie(header)).toEqual(PAYLOAD);
  });

  it('с join', () => {
    const withJoin = { ...PAYLOAD, join: 'a'.repeat(32) };
    const header = buildTelegramOAuthCookie(withJoin, { secure: false }).split(';')[0];
    expect(readTelegramOAuthCookie(header)).toEqual(withJoin);
  });
});

describe('readTelegramOAuthCookie — отказы', () => {
  it('cookie нет — null', () => {
    expect(readTelegramOAuthCookie(undefined)).toBeNull();
    expect(readTelegramOAuthCookie('other=1')).toBeNull();
  });

  it('cookie Google под этим именем не читается', () => {
    const value = Buffer.from(JSON.stringify(PAYLOAD)).toString('base64url');
    expect(readTelegramOAuthCookie(`google_oauth=${value}`)).toBeNull();
  });

  it.each(['state', 'verifier'])('без обязательного поля %s — null', (missing) => {
    const partial: Record<string, unknown> = { ...PAYLOAD };
    delete partial[missing];
    expect(readTelegramOAuthCookie(headerFor(partial))).toBeNull();
  });

  it('state не строка — null', () => {
    expect(readTelegramOAuthCookie(headerFor({ ...PAYLOAD, state: 5 }))).toBeNull();
  });

  it('join не строка — null', () => {
    expect(readTelegramOAuthCookie(headerFor({ ...PAYLOAD, join: 123 }))).toBeNull();
  });
});

describe('clearTelegramOAuthCookie', () => {
  it('Max-Age=0, тот же Path, значение пустое', () => {
    const cookie = clearTelegramOAuthCookie();
    expect(cookie).toContain('Max-Age=0');
    expect(cookie).toContain('Path=/api/auth/telegram/oidc');
    expect(cookie).toContain(`${TELEGRAM_OAUTH_COOKIE}=;`);
  });
});
