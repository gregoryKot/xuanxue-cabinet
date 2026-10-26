// Юнит-тест TelegramOidcService — фейковые ConfigService/TelegramOidcTokenClient/
// UsersService/AuthService/LoginIdentityService, без Mongo и без сети
// (CLAUDE.md «Тесты»). id_token — настоящий parseTelegramIdToken на самодельном
// JWT: оркестрация проверяется целиком, а не с замоканным парсером.
import type { ConfigService } from '@nestjs/config';
import { DateTime } from 'luxon';
import {
  ACCESS_MESSAGE,
  TELEGRAM_LOGIN_FAILED_MESSAGE,
  TELEGRAM_OIDC_NOT_AVAILABLE_MESSAGE,
} from '@xuanxue/shared';
import { ForbiddenError, UnauthorizedError } from '../common/errors';
import type { LoginIdentityService } from '../users/login-identity.service';
import type { UserLean, UsersService } from '../users/users.service';
import type { AuthService } from './auth.service';
import { codeChallenge } from './google-oauth-pkce';
import { TELEGRAM_OAUTH_COOKIE, readTelegramOAuthCookie } from './telegram-oidc-cookie';
import type { TelegramOidcTokenClient } from './telegram-oidc-token-client';
import { TelegramOidcService } from './telegram-oidc.service';

const NOW = DateTime.fromISO('2026-10-26T10:00:00Z');
const CLIENT_ID = '123456';
const ENV: Record<string, string | undefined> = {
  BOT_TOKEN: `${CLIENT_ID}:abcDEFghi-token_padding_here_xx`,
  TELEGRAM_LOGIN_CLIENT_SECRET: 'client-secret-value',
  PUBLIC_URL: 'https://cabinet.example',
};
const STATE = 'a'.repeat(43);
const CODE = 'c'.repeat(20);

const USER: UserLean = {
  id: 'u1',
  name: 'Анна',
  telegramId: 987654321,
  roles: [],
  status: 'active',
  studentMode: false,
};

function jwt(claims: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `${header}.${payload}.sig`;
}

function idToken(overrides: Record<string, unknown> = {}): string {
  return jwt({
    iss: 'https://oauth.telegram.org',
    aud: CLIENT_ID,
    sub: 'opaque-sub',
    exp: NOW.plus({ minutes: 5 }).toSeconds(),
    id: 987654321,
    given_name: 'Анна',
    family_name: 'Петрова',
    ...overrides,
  });
}

function cookieHeader(payload: Record<string, unknown>): string {
  const value = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${TELEGRAM_OAUTH_COOKIE}=${value}`;
}

const STORED = { state: STATE, verifier: 'the-verifier' };

interface BuildOptions {
  env?: Record<string, string | undefined>;
  exchange?: TelegramOidcTokenClient['exchange'];
  resolveTelegramUser?: LoginIdentityService['resolveTelegramUser'];
  touchLogin?: UsersService['touchLogin'];
  issueSession?: AuthService['issueSession'];
}

function build(options: BuildOptions = {}): TelegramOidcService {
  const env = options.env ?? ENV;
  const config = { get: (key: string) => env[key] } as unknown as ConfigService;
  const tokenClient = {
    exchange: options.exchange ?? (() => Promise.resolve(idToken())),
  } as unknown as TelegramOidcTokenClient;
  const usersService = {
    touchLogin: options.touchLogin ?? (() => Promise.resolve()),
  } as unknown as UsersService;
  const authService = {
    issueSession:
      options.issueSession ?? (() => ({ token: 't', cookies: ['session=tok'] })),
  } as unknown as AuthService;
  const loginIdentity = {
    resolveTelegramUser: options.resolveTelegramUser ?? (() => Promise.resolve(USER)),
  } as unknown as LoginIdentityService;
  return new TelegramOidcService(
    config,
    tokenClient,
    usersService,
    authService,
    loginIdentity,
  );
}

describe('TelegramOidcService.isEnabled', () => {
  it('BOT_TOKEN, секрет и PUBLIC_URL заданы — true', () => {
    expect(build().isEnabled()).toBe(true);
  });

  it('нет TELEGRAM_LOGIN_CLIENT_SECRET — false, кабинет на прежнем входе', () => {
    const env = { ...ENV, TELEGRAM_LOGIN_CLIENT_SECRET: undefined };
    expect(build({ env }).isEnabled()).toBe(false);
  });
});

describe('TelegramOidcService.start', () => {
  it('не настроено — NotAvailableError', () => {
    expect(() => build({ env: {} }).start(undefined)).toThrow(
      TELEGRAM_OIDC_NOT_AVAILABLE_MESSAGE,
    );
  });

  it('cookie несёт state и verifier, url ведёт на Telegram с тем же state и challenge от verifier', () => {
    const { cookie, url } = build().start(undefined);

    const stored = readTelegramOAuthCookie(cookie.split(';')[0]);
    const params = new URL(url).searchParams;
    expect(stored).toBeTruthy();
    expect(params.get('state')).toBe(stored?.state);
    expect(params.get('code_challenge')).toBe(codeChallenge(stored?.verifier ?? ''));
    expect(params.get('client_id')).toBe(CLIENT_ID);
    expect(params.get('redirect_uri')).toBe('https://cabinet.example/login/telegram');
  });

  it('каждый старт — новые state и verifier', () => {
    const service = build();
    const first = readTelegramOAuthCookie(service.start(undefined).cookie.split(';')[0]);
    const second = readTelegramOAuthCookie(service.start(undefined).cookie.split(';')[0]);

    expect(first?.state).not.toBe(second?.state);
    expect(first?.verifier).not.toBe(second?.verifier);
  });

  it('Secure у cookie — только в production', () => {
    expect(build().start(undefined).cookie).not.toContain('Secure');
    const production = build({ env: { ...ENV, NODE_ENV: 'production' } });
    expect(production.start(undefined).cookie).toContain('Secure');
  });

  it('join валидного формата сохраняется в cookie', () => {
    const valid = 'a'.repeat(32);
    const { cookie } = build().start(valid);

    expect(readTelegramOAuthCookie(cookie.split(';')[0])?.join).toBe(valid);
  });

  it.each([
    ['короткий-мусор'],
    [''],
    [undefined],
    [['a'.repeat(32)] as unknown as string],
  ])('join %p отбрасывается', (join) => {
    const { cookie } = build().start(join);

    expect(readTelegramOAuthCookie(cookie.split(';')[0])?.join).toBeUndefined();
  });
});

describe('TelegramOidcService.login — отказы', () => {
  it('не настроено — NotAvailableError, а не 401', async () => {
    await expect(
      build({ env: {} }).login({ code: CODE, state: STATE }, undefined, NOW),
    ).rejects.toThrow(TELEGRAM_OIDC_NOT_AVAILABLE_MESSAGE);
  });

  it('cookie отсутствует — 401, в Telegram не ходим', async () => {
    let exchanged = false;
    const service = build({
      exchange: () => {
        exchanged = true;
        return Promise.resolve(idToken());
      },
    });

    await expect(
      service.login({ code: CODE, state: STATE }, undefined, NOW),
    ).rejects.toThrow(new UnauthorizedError(TELEGRAM_LOGIN_FAILED_MESSAGE));
    expect(exchanged).toBe(false);
  });

  it('cookie повреждена (нет verifier) — 401', async () => {
    const cookie = cookieHeader({ state: STATE });

    await expect(
      build().login({ code: CODE, state: STATE }, cookie, NOW),
    ).rejects.toThrow(TELEGRAM_LOGIN_FAILED_MESSAGE);
  });

  it('state в теле не совпадает с cookie — 401, обмена кода не было', async () => {
    let exchanged = false;
    const service = build({
      exchange: () => {
        exchanged = true;
        return Promise.resolve(idToken());
      },
    });

    await expect(
      service.login({ code: CODE, state: 'b'.repeat(43) }, cookieHeader(STORED), NOW),
    ).rejects.toThrow(TELEGRAM_LOGIN_FAILED_MESSAGE);
    expect(exchanged).toBe(false);
  });

  it('Telegram отказал в обмене (exchange вернул null) — 401', async () => {
    const service = build({ exchange: () => Promise.resolve(null) });

    await expect(
      service.login({ code: CODE, state: STATE }, cookieHeader(STORED), NOW),
    ).rejects.toThrow(TELEGRAM_LOGIN_FAILED_MESSAGE);
  });

  it.each([
    ['чужой iss', { iss: 'https://evil.example' }],
    ['чужой aud', { aud: '999' }],
    ['просроченный exp', { exp: NOW.minus({ minutes: 1 }).toSeconds() }],
    ['нет claim id', { id: undefined }],
  ])('id_token не прошёл проверку (%s) — 401, а не 500', async (_label, claims) => {
    const service = build({ exchange: () => Promise.resolve(idToken(claims)) });

    await expect(
      service.login({ code: CODE, state: STATE }, cookieHeader(STORED), NOW),
    ).rejects.toThrow(new UnauthorizedError(TELEGRAM_LOGIN_FAILED_MESSAGE));
  });

  it('заблокированный — 403 и без сессии', async () => {
    let issued = false;
    const service = build({
      resolveTelegramUser: () => Promise.resolve({ ...USER, status: 'blocked' }),
      issueSession: () => {
        issued = true;
        return { token: 't', cookies: [] };
      },
    });

    await expect(
      service.login({ code: CODE, state: STATE }, cookieHeader(STORED), NOW),
    ).rejects.toThrow(new ForbiddenError(ACCESS_MESSAGE));
    expect(issued).toBe(false);
  });

  it('новый человек без приглашения — ошибка LoginIdentityService доходит как есть', async () => {
    const service = build({
      resolveTelegramUser: () => Promise.reject(new ForbiddenError('нужно приглашение')),
    });

    await expect(
      service.login({ code: CODE, state: STATE }, cookieHeader(STORED), NOW),
    ).rejects.toThrow('нужно приглашение');
  });
});

describe('TelegramOidcService.login — успех', () => {
  it('в обмен уходят code из тела и verifier из cookie, redirect_uri и клиент из конфигурации', async () => {
    let received: Parameters<TelegramOidcTokenClient['exchange']>[0] | undefined;
    const service = build({
      exchange: (params) => {
        received = params;
        return Promise.resolve(idToken());
      },
    });

    await service.login({ code: CODE, state: STATE }, cookieHeader(STORED), NOW);

    expect(received).toEqual({
      code: CODE,
      verifier: 'the-verifier',
      config: {
        clientId: CLIENT_ID,
        clientSecret: 'client-secret-value',
        redirectUri: 'https://cabinet.example/login/telegram',
      },
    });
  });

  it('ключ входа — claim id, имя — из токена, join — из cookie; touchLogin и issueSession вызваны', async () => {
    let resolved: { id: number; name: string; join: string | undefined } | undefined;
    let touched: string | undefined;
    let issuedFor: string | undefined;
    const service = build({
      resolveTelegramUser: (id, name, join) => {
        resolved = { id, name, join };
        return Promise.resolve(USER);
      },
      touchLogin: (id) => {
        touched = id;
        return Promise.resolve();
      },
      issueSession: (id) => {
        issuedFor = id;
        return { token: 't', cookies: ['session=tok'] };
      },
    });
    const join = 'x'.repeat(32);

    const result = await service.login(
      { code: CODE, state: STATE },
      cookieHeader({ ...STORED, join }),
      NOW,
    );

    expect(resolved).toEqual({ id: 987654321, name: 'Анна Петрова', join });
    expect(touched).toBe(USER.id);
    expect(issuedFor).toBe(USER.id);
    expect(result).toEqual({ user: USER, cookies: ['session=tok'] });
  });

  it('cookie заявки лежит среди прочих в одном заголовке Cookie', async () => {
    const header = `session=old; ${cookieHeader(STORED)}`;

    const result = await build().login({ code: CODE, state: STATE }, header, NOW);

    expect(result.user).toEqual(USER);
  });
});
