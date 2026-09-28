// Юнит-тест GoogleAuthService — фейковые ConfigService/GoogleTokenClient/
// UsersService/AuthService/GoogleLoginIdentityService, без Mongo и без сети
// (CLAUDE.md «Тесты»). id_token — настоящий parseGoogleIdToken на самодельном
// JWT (тот же приём, что google-id-token.spec.ts): оркестрация проверяется
// целиком, а не с замоканным парсером.
import type { ConfigService } from '@nestjs/config';
import { DateTime } from 'luxon';
import {
  ACCESS_MESSAGE,
  GOOGLE_LOGIN_FAILED_MESSAGE,
  GOOGLE_LOGIN_NOT_AVAILABLE_MESSAGE,
} from '@xuanxue/shared';
import { GoogleAuthService } from './google-auth.service';
import type { GoogleLoginIdentityService } from '../users/google-login-identity.service';
import type { UserLean, UsersService } from '../users/users.service';
import type { AuthService } from './auth.service';
import { GOOGLE_OAUTH_COOKIE, readGoogleOAuthCookie } from './google-oauth-cookie';
import type { GoogleTokenClient } from './google-token-client';

const NOW = DateTime.fromISO('2026-09-28T10:00:00Z');
const CLIENT_ID = 'client.apps.googleusercontent.com';
const ENV: Record<string, string> = {
  GOOGLE_CLIENT_ID: CLIENT_ID,
  GOOGLE_CLIENT_SECRET: 'secret-value-long-enough',
  PUBLIC_URL: 'https://cabinet.example',
};

function fakeConfig(values: Record<string, string | undefined> = ENV): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

function jwt(claims: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `${header}.${payload}.sig`;
}

function cookieHeader(payload: Record<string, unknown>): string {
  const value = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${GOOGLE_OAUTH_COOKIE}=${value}`;
}

const USER: UserLean = { id: 'u1', name: 'Анна', roles: [], status: 'active' };

interface BuildOptions {
  env?: Record<string, string | undefined>;
  exchange?: GoogleTokenClient['exchange'];
  resolveGoogleUser?: GoogleLoginIdentityService['resolveGoogleUser'];
  touchLogin?: UsersService['touchLogin'];
  issueSession?: AuthService['issueSession'];
}

function build(options: BuildOptions = {}) {
  const tokenClient = {
    exchange: options.exchange ?? (() => Promise.resolve('unused')),
  } as unknown as GoogleTokenClient;
  const usersService = {
    touchLogin: options.touchLogin ?? (() => Promise.resolve()),
  } as unknown as UsersService;
  const authService = {
    issueSession: options.issueSession ?? (() => ({ token: 't', cookie: 'session=tok' })),
  } as unknown as AuthService;
  const identityService = {
    resolveGoogleUser: options.resolveGoogleUser ?? (() => Promise.resolve(USER)),
  } as unknown as GoogleLoginIdentityService;

  return new GoogleAuthService(
    fakeConfig(options.env ?? ENV),
    tokenClient,
    usersService,
    authService,
    identityService,
  );
}

describe('GoogleAuthService.isEnabled', () => {
  it('все три переменные заданы — true', () => {
    expect(build().isEnabled()).toBe(true);
  });

  it('нет GOOGLE_CLIENT_ID — false', () => {
    expect(build({ env: { ...ENV, GOOGLE_CLIENT_ID: undefined } }).isEnabled()).toBe(
      false,
    );
  });
});

describe('GoogleAuthService.start', () => {
  it('не настроено — NotAvailableError', () => {
    const service = build({ env: {} });
    expect(() => service.start(undefined)).toThrow(GOOGLE_LOGIN_NOT_AVAILABLE_MESSAGE);
  });

  it('настроено — cookie несёт state/verifier/nonce, url ведёт на Google с тем же state', () => {
    const service = build();
    const { cookie, url } = service.start(undefined);

    expect(cookie).toContain(GOOGLE_OAUTH_COOKIE);
    const state = new URL(url).searchParams.get('state') ?? '';
    expect(state).toBeTruthy();
    expect(readGoogleOAuthCookie(cookie.split(';')[0])?.state).toBe(state);
  });

  it('join валидного формата — сохраняется, невалидного — отбрасывается', () => {
    const service = build();
    const valid = 'a'.repeat(32);

    const withValidJoin = service.start(valid).cookie;
    expect(readGoogleOAuthCookie(withValidJoin.split(';')[0])?.join).toBe(valid);

    const withInvalidJoin = service.start('короткий-мусор').cookie;
    expect(readGoogleOAuthCookie(withInvalidJoin.split(';')[0])?.join).toBeUndefined();
  });
});

describe('GoogleAuthService.login', () => {
  it('не настроено — NotAvailableError', async () => {
    const service = build({ env: {} });
    await expect(
      service.login({ code: 'c', state: 's' }, undefined, NOW),
    ).rejects.toThrow(GOOGLE_LOGIN_NOT_AVAILABLE_MESSAGE);
  });

  it('cookie отсутствует — 401', async () => {
    const service = build();
    await expect(
      service.login({ code: 'c'.repeat(20), state: 's'.repeat(43) }, undefined, NOW),
    ).rejects.toThrow(GOOGLE_LOGIN_FAILED_MESSAGE);
  });

  it('state в теле не совпадает с cookie — 401', async () => {
    const service = build();
    const cookie = cookieHeader({ state: 'a'.repeat(43), verifier: 'v', nonce: 'n' });

    await expect(
      service.login({ code: 'c'.repeat(20), state: 'b'.repeat(43) }, cookie, NOW),
    ).rejects.toThrow(GOOGLE_LOGIN_FAILED_MESSAGE);
  });

  it('GoogleTokenClient.exchange вернул null (Google отказал) — 401', async () => {
    const service = build({ exchange: () => Promise.resolve(null) });
    const cookie = cookieHeader({ state: 'a'.repeat(43), verifier: 'v', nonce: 'n' });

    await expect(
      service.login({ code: 'c'.repeat(20), state: 'a'.repeat(43) }, cookie, NOW),
    ).rejects.toThrow(GOOGLE_LOGIN_FAILED_MESSAGE);
  });

  it('id_token не прошёл проверку (nonce не тот) — 401, не 500', async () => {
    const badToken = jwt({
      iss: 'https://accounts.google.com',
      aud: CLIENT_ID,
      sub: 'sub-1',
      exp: NOW.plus({ minutes: 5 }).toSeconds(),
      nonce: 'другой-nonce',
    });
    const service = build({ exchange: () => Promise.resolve(badToken) });
    const cookie = cookieHeader({ state: 'a'.repeat(43), verifier: 'v', nonce: 'n' });

    await expect(
      service.login({ code: 'c'.repeat(20), state: 'a'.repeat(43) }, cookie, NOW),
    ).rejects.toThrow(GOOGLE_LOGIN_FAILED_MESSAGE);
  });

  it('успешный вход — resolveGoogleUser получает identity/join, touchLogin и issueSession вызваны', async () => {
    const idToken = jwt({
      iss: 'https://accounts.google.com',
      aud: CLIENT_ID,
      sub: 'sub-ok',
      exp: NOW.plus({ minutes: 5 }).toSeconds(),
      nonce: 'the-nonce',
      email: 'anna@gmail.com',
      email_verified: true,
    });
    let receivedJoin: string | undefined;
    let touched: string | undefined;
    let issuedFor: string | undefined;
    const service = build({
      exchange: () => Promise.resolve(idToken),
      resolveGoogleUser: (identity, join) => {
        receivedJoin = join;
        expect(identity.sub).toBe('sub-ok');
        expect(identity.emailAuthoritative).toBe(true);
        return Promise.resolve(USER);
      },
      touchLogin: (id) => {
        touched = id;
        return Promise.resolve();
      },
      issueSession: (id) => {
        issuedFor = id;
        return { token: 't', cookie: 'session=tok' };
      },
    });
    const cookie = cookieHeader({
      state: 'a'.repeat(43),
      verifier: 'v',
      nonce: 'the-nonce',
      join: 'x'.repeat(32),
    });

    const result = await service.login(
      { code: 'c'.repeat(20), state: 'a'.repeat(43) },
      cookie,
      NOW,
    );

    expect(result).toEqual({ user: USER, cookie: 'session=tok' });
    expect(receivedJoin).toBe('x'.repeat(32));
    expect(touched).toBe(USER.id);
    expect(issuedFor).toBe(USER.id);
  });

  it('заблокированный пользователь — ForbiddenError, сессия не выпускается', async () => {
    const idToken = jwt({
      iss: 'https://accounts.google.com',
      aud: CLIENT_ID,
      sub: 'sub-blocked',
      exp: NOW.plus({ minutes: 5 }).toSeconds(),
      nonce: 'the-nonce',
    });
    let issued = false;
    const service = build({
      exchange: () => Promise.resolve(idToken),
      resolveGoogleUser: () => Promise.resolve({ ...USER, status: 'blocked' }),
      issueSession: () => {
        issued = true;
        return { token: 't', cookie: 'session=tok' };
      },
    });
    const cookie = cookieHeader({
      state: 'a'.repeat(43),
      verifier: 'v',
      nonce: 'the-nonce',
    });

    await expect(
      service.login({ code: 'c'.repeat(20), state: 'a'.repeat(43) }, cookie, NOW),
    ).rejects.toThrow(ACCESS_MESSAGE);
    expect(issued).toBe(false);
  });
});
