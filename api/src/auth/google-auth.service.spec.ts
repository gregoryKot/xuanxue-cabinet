// Юнит-тест GoogleAuthService — фейковые ConfigService/GoogleTokenClient/
// UsersService/AuthService/GoogleLoginIdentityService/GoogleLinkService, без
// Mongo и без сети (CLAUDE.md «Тесты»). id_token — настоящий
// parseGoogleIdToken на самодельном JWT (тот же приём, что
// google-id-token.spec.ts): оркестрация проверяется целиком, а не с
// замоканным парсером. Сессия текущего запроса (findSessionUser) читается
// через реальный `session` cookie рядом с `google_oauth` в одном заголовке
// `Cookie` — так же, как в проде.
import type { ConfigService } from '@nestjs/config';
import { DateTime } from 'luxon';
import {
  ACCESS_MESSAGE,
  GOOGLE_LINK_SESSION_MESSAGE,
  GOOGLE_LOGIN_FAILED_MESSAGE,
  GOOGLE_LOGIN_NOT_AVAILABLE_MESSAGE,
} from '@xuanxue/shared';
import { GoogleAuthService } from './google-auth.service';
import type { GoogleLinkService } from '../users/google-link.service';
import type { GoogleLoginIdentityService } from '../users/google-login-identity.service';
import type { UserLean, UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import { GOOGLE_OAUTH_COOKIE, readGoogleOAuthCookie } from './google-oauth-cookie';
import { buildSessionCookie } from './session-cookie';
import { signSession } from './session-token';
import type { GoogleTokenClient } from './google-token-client';

const NOW = DateTime.fromISO('2026-09-28T10:00:00Z');
const CLIENT_ID = 'client.apps.googleusercontent.com';
const ENV: Record<string, string> = {
  GOOGLE_CLIENT_ID: CLIENT_ID,
  GOOGLE_CLIENT_SECRET: 'secret-value-long-enough',
  PUBLIC_URL: 'https://cabinet.example',
};
const SESSION_SECRET = 'x'.repeat(32);

function fakeConfig(values: Record<string, string | undefined> = ENV): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

function jwt(claims: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `${header}.${payload}.sig`;
}

function cookieHeader(payload: Record<string, unknown>, extra?: string): string {
  const value = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const google = `${GOOGLE_OAUTH_COOKIE}=${value}`;
  return extra ? `${extra}; ${google}` : google;
}

/** Настоящий `session` cookie, подписанный тем же secret, что примет
 * AuthService.verifySession в fakeAuth() ниже — findSessionUser читает его
 * без мока, той же функцией, что и продовый AuthGuard. */
function realSessionCookie(userId: string): string {
  const token = signSession({ userId, issuedAt: NOW }, SESSION_SECRET);
  return buildSessionCookie(token, { secure: false, maxAgeSec: 3600 }).split(
    ';',
  )[0] as string;
}

const USER: UserLean = { id: 'u1', name: 'Анна', roles: [], status: 'active' };

interface BuildOptions {
  env?: Record<string, string | undefined>;
  exchange?: GoogleTokenClient['exchange'];
  resolveGoogleUser?: GoogleLoginIdentityService['resolveGoogleUser'];
  touchLogin?: UsersService['touchLogin'];
  issueSession?: AuthService['issueSession'];
  findById?: UsersService['findById'];
  link?: GoogleLinkService['link'];
}

function build(options: BuildOptions = {}) {
  const tokenClient = {
    exchange: options.exchange ?? (() => Promise.resolve('unused')),
  } as unknown as GoogleTokenClient;
  const usersService = {
    touchLogin: options.touchLogin ?? (() => Promise.resolve()),
    findById: options.findById ?? (() => Promise.resolve(USER)),
  } as unknown as UsersService;
  // verifySession настоящий (не фейк) — findSessionUser реально подписывает
  // и проверяет payload через session-token.ts, тест не должен угадывать
  // формат payload сам; issueSession — фейк, только для входа.
  const realAuthService = new AuthService(SESSION_SECRET, fakeConfig());
  const authService = {
    issueSession: options.issueSession ?? (() => ({ token: 't', cookie: 'session=tok' })),
    verifySession: (token: string, now: DateTime) =>
      realAuthService.verifySession(token, now),
  } as unknown as AuthService;
  const identityService = {
    resolveGoogleUser: options.resolveGoogleUser ?? (() => Promise.resolve(USER)),
  } as unknown as GoogleLoginIdentityService;
  const linkService = {
    link:
      options.link ??
      ((user: UserLean) => Promise.resolve({ ...user, googleId: 'linked' })),
  } as unknown as GoogleLinkService;

  return new GoogleAuthService(
    fakeConfig(options.env ?? ENV),
    tokenClient,
    usersService,
    authService,
    identityService,
    linkService,
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

describe('GoogleAuthService.start — обычный вход', () => {
  it('не настроено — NotAvailableError', async () => {
    const service = build({ env: {} });
    await expect(service.start({}, undefined, NOW)).rejects.toThrow(
      GOOGLE_LOGIN_NOT_AVAILABLE_MESSAGE,
    );
  });

  it('настроено — cookie несёт state/verifier/nonce, url ведёт на Google с тем же state', async () => {
    const service = build();
    const result = await service.start({}, undefined, NOW);
    if (result.kind !== 'oauth') throw new Error('ожидался kind: oauth');

    expect(result.cookie).toContain(GOOGLE_OAUTH_COOKIE);
    const state = new URL(result.url).searchParams.get('state') ?? '';
    expect(state).toBeTruthy();
    expect(readGoogleOAuthCookie(result.cookie.split(';')[0])?.state).toBe(state);
  });

  it('join валидного формата — сохраняется, невалидного — отбрасывается', async () => {
    const service = build();
    const valid = 'a'.repeat(32);

    const withValidJoin = await service.start({ joinCode: valid }, undefined, NOW);
    const withInvalidJoin = await service.start(
      { joinCode: 'короткий-мусор' },
      undefined,
      NOW,
    );
    if (withValidJoin.kind !== 'oauth' || withInvalidJoin.kind !== 'oauth') {
      throw new Error('ожидался kind: oauth');
    }

    expect(readGoogleOAuthCookie(withValidJoin.cookie.split(';')[0])?.join).toBe(valid);
    expect(
      readGoogleOAuthCookie(withInvalidJoin.cookie.split(';')[0])?.join,
    ).toBeUndefined();
  });
});

describe('GoogleAuthService.start — intent=link', () => {
  it('без сессии — kind: no-session, url на /login, cookie не ставится', async () => {
    const service = build({ findById: () => Promise.resolve(null) });

    const result = await service.start({ intent: 'link' }, undefined, NOW);

    expect(result).toEqual({ kind: 'no-session', url: 'https://cabinet.example/login' });
  });

  it('пользователь заблокирован — то же no-session, что без сессии', async () => {
    const service = build({
      findById: () => Promise.resolve({ ...USER, status: 'blocked' }),
    });
    const cookie = realSessionCookie(USER.id);

    const result = await service.start({ intent: 'link' }, cookie, NOW);

    expect(result.kind).toBe('no-session');
  });

  it('с валидной сессией — cookie несёт intent: link и userId сессии, join не пишется', async () => {
    const service = build();
    const cookie = realSessionCookie(USER.id);

    const result = await service.start(
      { intent: 'link', joinCode: 'a'.repeat(32) },
      cookie,
      NOW,
    );
    if (result.kind !== 'oauth') throw new Error('ожидался kind: oauth');

    const stored = readGoogleOAuthCookie(result.cookie.split(';')[0]);
    expect(stored?.intent).toBe('link');
    expect(stored?.userId).toBe(USER.id);
    expect(stored?.join).toBeUndefined();
  });
});

describe('GoogleAuthService.login — обычный вход', () => {
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

describe('GoogleAuthService.login — intent=link', () => {
  function linkGoogleCookie(userId: string, sessionCookie: string): string {
    return cookieHeader(
      {
        state: 'a'.repeat(43),
        verifier: 'v',
        nonce: 'the-nonce',
        intent: 'link',
        userId,
      },
      sessionCookie,
    );
  }

  function idTokenFor(sub: string): string {
    return jwt({
      iss: 'https://accounts.google.com',
      aud: CLIENT_ID,
      sub,
      exp: NOW.plus({ minutes: 5 }).toSeconds(),
      nonce: 'the-nonce',
    });
  }

  it('сессии в запросе нет вовсе — 401 GOOGLE_LINK_SESSION_MESSAGE, resolveGoogleUser не зовётся', async () => {
    let resolveCalled = false;
    const service = build({
      exchange: () => Promise.resolve(idTokenFor('sub-1')),
      resolveGoogleUser: () => {
        resolveCalled = true;
        return Promise.resolve(USER);
      },
    });
    const cookie = cookieHeader({
      state: 'a'.repeat(43),
      verifier: 'v',
      nonce: 'the-nonce',
      intent: 'link',
      userId: USER.id,
    });

    await expect(
      service.login({ code: 'c'.repeat(20), state: 'a'.repeat(43) }, cookie, NOW),
    ).rejects.toThrow(GOOGLE_LINK_SESSION_MESSAGE);
    expect(resolveCalled).toBe(false);
  });

  it('сессия принадлежит другому человеку, не тому, что начал привязку — 401', async () => {
    const service = build({
      exchange: () => Promise.resolve(idTokenFor('sub-mismatch')),
      findById: (id) =>
        Promise.resolve(id === USER.id ? USER : { ...USER, id: 'someone-else' }),
    });
    const otherSession = realSessionCookie('someone-else');
    const cookie = linkGoogleCookie(USER.id, otherSession);

    await expect(
      service.login({ code: 'c'.repeat(20), state: 'a'.repeat(43) }, cookie, NOW),
    ).rejects.toThrow(GOOGLE_LINK_SESSION_MESSAGE);
  });

  it('сессия совпадает, но пользователь заблокирован — 403 ACCESS_MESSAGE', async () => {
    const service = build({
      exchange: () => Promise.resolve(idTokenFor('sub-2')),
      findById: () => Promise.resolve({ ...USER, status: 'blocked' }),
    });
    const cookie = linkGoogleCookie(USER.id, realSessionCookie(USER.id));

    await expect(
      service.login({ code: 'c'.repeat(20), state: 'a'.repeat(43) }, cookie, NOW),
    ).rejects.toThrow(ACCESS_MESSAGE);
  });

  it('успешная привязка — GoogleLinkService.link вызван, новая сессия НЕ выпускается', async () => {
    let issued = false;
    let linkedWith: { userId: string; sub: string } | undefined;
    const service = build({
      exchange: () => Promise.resolve(idTokenFor('sub-3')),
      link: (user, identity) => {
        linkedWith = { userId: user.id, sub: identity.sub };
        return Promise.resolve({ ...user, googleId: identity.sub });
      },
      issueSession: () => {
        issued = true;
        return { token: 't', cookie: 'session=tok' };
      },
    });
    const cookie = linkGoogleCookie(USER.id, realSessionCookie(USER.id));

    const result = await service.login(
      { code: 'c'.repeat(20), state: 'a'.repeat(43) },
      cookie,
      NOW,
    );

    expect(result).toEqual({ user: { ...USER, googleId: 'sub-3' } });
    expect(result.cookie).toBeUndefined();
    expect(linkedWith).toEqual({ userId: USER.id, sub: 'sub-3' });
    expect(issued).toBe(false);
  });
});
