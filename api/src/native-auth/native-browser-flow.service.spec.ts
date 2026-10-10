// Поток без HTTP и без Mongo: попытки — заглушка, сессию решает подделанный
// verifySession. Ответ сверяется разбором Location: набор параметров callback
// (code/state/iss или error/state/iss) — контракт профиля Workshop 3c98d4a.
import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { DateTime } from 'luxon';
import { NATIVE_CLIENT_ID, NATIVE_REDIRECT_URI, NATIVE_SCOPE } from '@xuanxue/shared';
import type { AuthService } from '../auth/auth.service';
import type { UserLean, UsersService } from '../users/users.service';
import type {
  NativeAuthorizationsService,
  NativeCompleted,
  NativeCompletion,
} from './native-authorizations.service';
import { NATIVE_AUTHZ_COOKIE } from './native-authz-cookie';
import { NativeBrowserFlowService } from './native-browser-flow.service';
import type { NativeBrowserOutcome } from './native-browser-response';
import { sha256Hex } from './native-secrets';

const NOW = DateTime.fromISO('2026-10-10T12:00:00Z', { zone: 'utc' });
const ISSUER = 'https://staging.xuanxue.su';
const STATE = 's'.repeat(43);
const CHALLENGE = 'c'.repeat(43);
const BINDING = 'b'.repeat(43);
const ATTEMPT = 'a'.repeat(24);
const CODE = 'k'.repeat(43);
const SESSION_TOKEN = 'session-token';
const TARGET = { issuer: ISSUER, redirectUri: NATIVE_REDIRECT_URI, state: STATE };
const VALID: Record<string, string> = {
  response_type: 'code',
  client_id: NATIVE_CLIENT_ID,
  redirect_uri: NATIVE_REDIRECT_URI,
  scope: NATIVE_SCOPE,
  state: STATE,
  code_challenge: CHALLENGE,
  code_challenge_method: 'S256',
};
const BAD_REQUEST = { kind: 'page', status: 400 };
const SESSION = `session=${SESSION_TOKEN}`;
const BOUND = `${NATIVE_AUTHZ_COOKIE}=${BINDING}`;

function build(options: { status?: UserLean['status']; publicUrl?: string } = {}) {
  const user: UserLean = {
    id: 'u1',
    name: 'Мария',
    roles: [],
    status: options.status ?? 'active',
    studentMode: false,
  };
  const authorizations = {
    create: jest.fn().mockResolvedValue(ATTEMPT),
    findPending: jest.fn().mockResolvedValue(TARGET),
    complete: jest.fn((_id: string, _hash: string, completion: NativeCompletion) =>
      Promise.resolve<NativeCompleted | null>(
        'userId' in completion ? { ...TARGET, code: CODE } : TARGET,
      ),
    ),
  };
  const authService = {
    verifySession: jest.fn((token: string) =>
      token === SESSION_TOKEN ? { sub: user.id } : null,
    ),
  };
  const usersService = { findById: jest.fn().mockResolvedValue(user) };
  const config = {
    get: jest.fn((key: string) =>
      key === 'PUBLIC_URL' ? (options.publicUrl ?? ISSUER) : undefined,
    ),
  };
  const flow = new NativeBrowserFlowService(
    authorizations as unknown as NativeAuthorizationsService,
    authService as unknown as AuthService,
    usersService as unknown as UsersService,
    config as unknown as ConfigService,
  );
  return { flow, authorizations };
}

function request(path: string, ...cookies: string[]) {
  return {
    id: 'req-1',
    originalUrl: path,
    headers: cookies.length > 0 ? { cookie: cookies.join('; ') } : {},
  };
}

function authorizePath(params: Record<string, string> = VALID): string {
  return `/auth/native/authorize?${new URLSearchParams(params).toString()}`;
}

function continuePath(extra = ''): string {
  return `/auth/native/continue?attempt=${ATTEMPT}${extra}`;
}

function locationOf(outcome: NativeBrowserOutcome): URL {
  if (outcome.kind !== 'redirect') throw new Error(`страница ${outcome.status}`);
  return new URL(outcome.location, ISSUER);
}

function callbackOf(outcome: NativeBrowserOutcome): Record<string, string> {
  const url = locationOf(outcome);
  if (`${url.protocol}${url.pathname}` !== NATIVE_REDIRECT_URI) {
    throw new Error(`не callback: ${url.href}`);
  }
  return Object.fromEntries(url.searchParams);
}

function cookieOf(outcome: NativeBrowserOutcome): string {
  return outcome.kind === 'redirect' ? (outcome.cookie ?? '') : '';
}

function unavailable(): Error {
  return Object.assign(new Error('connect ECONNREFUSED'), {
    name: 'MongoServerSelectionError',
  });
}

function spyOnErrorLog(): jest.SpyInstance {
  return jest.spyOn(Logger.prototype, 'error').mockImplementation();
}

describe('NativeBrowserFlowService.authorize', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('клиент, redirect или state не прошли — локальная страница 400, попытки нет', async () => {
    const { flow, authorizations } = build();

    const outcome = await flow.authorize(
      request(authorizePath({ ...VALID, client_id: 'someone' })),
      NOW,
    );

    expect(outcome).toEqual(BAD_REQUEST);
    expect(authorizations.create).not.toHaveBeenCalled();
  });

  it('PUBLIC_URL не задан — страница 500 и error-лог с кодом обращения', async () => {
    const logged = spyOnErrorLog();
    const { flow } = build({ publicUrl: '' });

    const outcome = await flow.authorize(request(authorizePath()), NOW);

    expect(outcome).toEqual({ kind: 'page', status: 500 });
    expect(logged).toHaveBeenCalledWith(
      expect.stringContaining('requestId=req-1'),
      expect.any(String),
    );
  });

  it('ошибка после проверки state — в callback, без cookie и без попытки', async () => {
    const { flow, authorizations } = build();

    const outcome = await flow.authorize(
      request(authorizePath({ ...VALID, scope: 'account:write' })),
      NOW,
    );

    expect(callbackOf(outcome)).toEqual({
      error: 'invalid_scope',
      state: STATE,
      iss: ISSUER,
    });
    expect(outcome).not.toHaveProperty('cookie');
    expect(authorizations.create).not.toHaveBeenCalled();
  });

  it('активная сессия — код в callback и продлённая привязка браузера', async () => {
    const { flow, authorizations } = build();

    const outcome = await flow.authorize(request(authorizePath(), SESSION, BOUND), NOW);

    expect(callbackOf(outcome)).toEqual({ code: CODE, state: STATE, iss: ISSUER });
    expect(cookieOf(outcome)).toMatch(new RegExp(`^${BOUND}; `));
    expect(authorizations.create).toHaveBeenCalledWith(
      {
        clientId: NATIVE_CLIENT_ID,
        redirectUri: NATIVE_REDIRECT_URI,
        scope: NATIVE_SCOPE,
        state: STATE,
        codeChallenge: CHALLENGE,
        issuer: ISSUER,
      },
      sha256Hex(BINDING),
      NOW,
    );
    expect(authorizations.complete).toHaveBeenCalledWith(
      ATTEMPT,
      sha256Hex(BINDING),
      { userId: 'u1' },
      NOW,
    );
  });

  it('заблокированный человек — access_denied без кода', async () => {
    const { flow, authorizations } = build({ status: 'blocked' });

    const outcome = await flow.authorize(request(authorizePath(), SESSION, BOUND), NOW);

    expect(callbackOf(outcome)).toEqual({
      error: 'access_denied',
      state: STATE,
      iss: ISSUER,
    });
    expect(authorizations.complete).toHaveBeenCalledWith(
      ATTEMPT,
      sha256Hex(BINDING),
      { denied: true },
      NOW,
    );
  });

  it('без сессии — экран входа с номером попытки и новая привязка в cookie', async () => {
    const { flow, authorizations } = build();

    const outcome = await flow.authorize(request(authorizePath()), NOW);

    const location = locationOf(outcome);
    expect(location.pathname).toBe('/login/native');
    expect(Object.fromEntries(location.searchParams)).toEqual({ attempt: ATTEMPT });
    const issued = new RegExp(`^${NATIVE_AUTHZ_COOKIE}=([A-Za-z0-9_-]{43});`).exec(
      cookieOf(outcome),
    )?.[1];
    expect(issued).toBeDefined();
    expect(authorizations.create).toHaveBeenCalledWith(
      expect.anything(),
      sha256Hex(issued ?? ''),
      NOW,
    );
    expect(authorizations.complete).not.toHaveBeenCalled();
  });

  it('завершить попытку не вышло — страница 400 без cookie', async () => {
    const { flow, authorizations } = build();
    authorizations.complete.mockResolvedValue(null);

    const outcome = await flow.authorize(request(authorizePath(), SESSION, BOUND), NOW);

    expect(outcome).toEqual(BAD_REQUEST);
  });

  it('без originalUrl адрес читается из url', async () => {
    const { flow } = build();
    const { originalUrl, ...rest } = request(authorizePath(), SESSION, BOUND);

    const outcome = await flow.authorize({ ...rest, url: originalUrl }, NOW);

    expect(callbackOf(outcome)).toEqual({ code: CODE, state: STATE, iss: ISSUER });
  });

  it('базы нет — temporarily_unavailable в callback, без error-лога', async () => {
    const logged = spyOnErrorLog();
    const { flow, authorizations } = build();
    authorizations.create.mockRejectedValue(unavailable());

    const outcome = await flow.authorize(request(authorizePath(), SESSION), NOW);

    expect(callbackOf(outcome)).toEqual({
      error: 'temporarily_unavailable',
      state: STATE,
      iss: ISSUER,
    });
    expect(logged).not.toHaveBeenCalled();
  });

  it('другой сбой — server_error в callback и error-лог', async () => {
    const logged = spyOnErrorLog();
    const { flow, authorizations } = build();
    authorizations.create.mockRejectedValue(new Error('boom'));

    const outcome = await flow.authorize(request(authorizePath(), SESSION), NOW);

    expect(callbackOf(outcome)).toEqual({
      error: 'server_error',
      state: STATE,
      iss: ISSUER,
    });
    expect(logged).toHaveBeenCalledWith(
      expect.stringContaining('requestId=req-1'),
      expect.any(String),
    );
  });
});

describe('NativeBrowserFlowService.resume', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it.each([
    ['чужой параметр в адресе', request(continuePath(`&state=${STATE}`), BOUND)],
    ['нет cookie привязки', request(continuePath(), SESSION)],
    ['привязка не нашего формата', request(continuePath(), `${NATIVE_AUTHZ_COOKIE}=x`)],
  ])('%s — страница 400, попытка не ищется', async (_name, req) => {
    const { flow, authorizations } = build();

    expect(await flow.resume(req, NOW)).toEqual(BAD_REQUEST);
    expect(authorizations.findPending).not.toHaveBeenCalled();
  });

  it.each([
    ['базы нет — 503 без error-лога', unavailable(), 503, 0],
    ['другой сбой — 500 и error-лог', new Error('boom'), 500, 1],
  ])('поиск попытки упал: %s', async (_name, error, status, logs) => {
    const logged = spyOnErrorLog();
    const { flow, authorizations } = build();
    authorizations.findPending.mockRejectedValue(error);

    const outcome = await flow.resume(request(continuePath(), BOUND), NOW);

    expect(outcome).toEqual({ kind: 'page', status });
    expect(logged).toHaveBeenCalledTimes(logs);
  });

  it('попытка не найдена, истекла или чужая — страница 400', async () => {
    const { flow, authorizations } = build();
    authorizations.findPending.mockResolvedValue(null);

    const outcome = await flow.resume(request(continuePath(), SESSION, BOUND), NOW);

    expect(outcome).toEqual(BAD_REQUEST);
    expect(authorizations.findPending).toHaveBeenCalledWith(
      ATTEMPT,
      sha256Hex(BINDING),
      NOW,
    );
    expect(authorizations.complete).not.toHaveBeenCalled();
  });

  it('отмена — access_denied без кода', async () => {
    const { flow, authorizations } = build();

    const outcome = await flow.resume(request(continuePath('&cancel=1'), BOUND), NOW);

    expect(callbackOf(outcome)).toEqual({
      error: 'access_denied',
      state: STATE,
      iss: ISSUER,
    });
    expect(authorizations.complete).toHaveBeenCalledWith(
      ATTEMPT,
      sha256Hex(BINDING),
      { denied: true },
      NOW,
    );
  });

  it('завершить не вышло (вторая вкладка успела) — страница 400', async () => {
    const { flow, authorizations } = build();
    authorizations.complete.mockResolvedValue(null);

    const outcome = await flow.resume(request(continuePath(), SESSION, BOUND), NOW);

    expect(outcome).toEqual(BAD_REQUEST);
  });

  it('после входа в кабинет — код в callback, параметры из записи', async () => {
    const { flow } = build();

    const outcome = await flow.resume(request(continuePath(), SESSION, BOUND), NOW);

    expect(callbackOf(outcome)).toEqual({ code: CODE, state: STATE, iss: ISSUER });
    expect(outcome).not.toHaveProperty('cookie');
  });

  it('без сессии — снова экран входа той же попытки', async () => {
    const { flow, authorizations } = build();

    const outcome = await flow.resume(request(continuePath(), BOUND), NOW);

    expect(outcome).toEqual({
      kind: 'redirect',
      location: `/login/native?attempt=${ATTEMPT}`,
    });
    expect(authorizations.complete).not.toHaveBeenCalled();
  });

  it('сбой при завершении — server_error в callback по данным записи', async () => {
    spyOnErrorLog();
    const { flow, authorizations } = build();
    authorizations.complete.mockRejectedValue(new Error('boom'));

    const outcome = await flow.resume(request(continuePath(), SESSION, BOUND), NOW);

    expect(callbackOf(outcome)).toEqual({
      error: 'server_error',
      state: STATE,
      iss: ISSUER,
    });
  });
});
