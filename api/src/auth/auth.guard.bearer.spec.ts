// Юнит-спек второго credential гварда (ADR-0185): bearer приложения Daychi на
// маршруте с @AllowNativeBearer(). Без HTTP и Mongo — фейковый ExecutionContext
// и фейковый NativeGrantsService; настоящая проверка срока и отзыва — в
// native-grants.service.spec.ts, сквозная — в api/test/reminder-sync-read.
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DateTime } from 'luxon';
import {
  AmbiguousCredentialsError,
  ForbiddenError,
  UnauthorizedError,
} from '../common/errors';
import type { RequestLike } from '../common/http-headers';
import { NativeAuthError } from '../native-auth/native-auth-error';
import type { NativeGrantsService } from '../native-auth/native-grants.service';
import { fakeResponse } from '../test-support/http-fakes';
import { UsersService, type UserLean } from '../users/users.service';
import { ALLOW_NATIVE_BEARER_KEY, ROLES_KEY, SKIP_CSRF_KEY } from './auth.decorators';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { sessionCookieProfile } from './session-cookie';
import { signSession } from './session-token';

const SECRET = 'b'.repeat(32);
const NOW = DateTime.utc();
const TOKEN = 'a'.repeat(43);
const MARKED = { [ALLOW_NATIVE_BEARER_KEY]: true };

function user(overrides: Partial<UserLean> = {}): UserLean {
  return {
    id: 'u1',
    name: 'Мария',
    roles: [],
    status: 'active',
    studentMode: false,
    ...overrides,
  };
}

function sessionCookie(issuedAt: DateTime = NOW): string {
  return `session=${signSession({ userId: 'u1', issuedAt }, SECRET)}`;
}

/** Запрос с Authorization так, как его отдаёт Node: и `headers`, и `rawHeaders`. */
function request(options: {
  method?: string;
  authorization?: string[];
  headers?: Record<string, string>;
}): Partial<RequestLike> {
  const authorization = options.authorization ?? [];
  return {
    method: options.method ?? 'GET',
    headers: {
      ...(authorization[0] === undefined ? {} : { authorization: authorization[0] }),
      ...options.headers,
    },
    rawHeaders: authorization.flatMap((value) => ['Authorization', value]),
  };
}

function setup(
  req: Partial<RequestLike>,
  metadata: Record<string, unknown>,
  grants: Pick<NativeGrantsService, 'authenticate'>,
): { guard: AuthGuard; context: ExecutionContext; res: ReturnType<typeof fakeResponse> } {
  const res = fakeResponse();
  const reflector = {
    getAllAndOverride: (key: string) => metadata[key],
  } as unknown as Reflector;
  const full: RequestLike = { method: 'GET', headers: {}, ...req };
  const context = {
    switchToHttp: () => ({ getRequest: () => full, getResponse: () => res }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
  const users = { findById: () => Promise.resolve(user()) } as unknown as UsersService;
  const guard = new AuthGuard(
    reflector,
    users,
    new AuthService(SECRET, sessionCookieProfile('http://localhost:3000')),
    grants as NativeGrantsService,
  );
  return { guard, context, res };
}

function grantsFor(result: UserLean | NativeAuthError | Error): {
  authenticate: jest.Mock;
} {
  const authenticate = jest.fn();
  if (result instanceof Error) authenticate.mockRejectedValue(result);
  else authenticate.mockResolvedValue({ user: result });
  return { authenticate };
}

const requestOf = (context: ExecutionContext): RequestLike =>
  context.switchToHttp().getRequest<RequestLike>();

const bearerRequest = (extra: Parameters<typeof request>[0] = {}): Partial<RequestLike> =>
  request({ authorization: [`Bearer ${TOKEN}`], ...extra });

describe('AuthGuard — bearer на маршруте с @AllowNativeBearer()', () => {
  it('годный bearer — доступ, req.user заполнен, cookie не ставится', async () => {
    const grants = grantsFor(user());
    const { guard, context, res } = setup(bearerRequest(), MARKED, grants);

    await expect(guard.canActivate(context)).resolves.toBe(true);

    expect(requestOf(context).user).toMatchObject({ id: 'u1' });
    expect(grants.authenticate).toHaveBeenCalledWith(TOKEN, expect.any(DateTime));
    expect(res.headers).toEqual({});
  });

  it('bearer вместе с живой cookie — 400 ambiguous_credentials, bearer не проверяется', async () => {
    const grants = grantsFor(user());
    // Старая cookie: на пути cookie её перевыпустили бы, здесь Set-Cookie быть не должно.
    const headers = { cookie: sessionCookie(NOW.minus({ days: 8 })) };
    const { guard, context, res } = setup(bearerRequest({ headers }), MARKED, grants);

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      AmbiguousCredentialsError,
    );
    expect(grants.authenticate).not.toHaveBeenCalled();
    expect(res.headers).toEqual({});
  });

  it('bearer вместе с негодной cookie — путь bearer, cookie ничего не решает', async () => {
    const grants = grantsFor(user());
    const headers = { cookie: 'session=не-токен' };
    const { guard, context } = setup(bearerRequest({ headers }), MARKED, grants);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(grants.authenticate).toHaveBeenCalledTimes(1);
  });

  it('без Authorization работает cookie, с перевыпуском старого токена', async () => {
    const grants = grantsFor(user());
    const headers = { cookie: sessionCookie(NOW.minus({ days: 8 })) };
    const { guard, context, res } = setup(request({ headers }), MARKED, grants);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(grants.authenticate).not.toHaveBeenCalled();
    expect(res.headers['Set-Cookie']).toBeDefined();
  });

  it('ни cookie, ни Authorization — 401', async () => {
    const { guard, context } = setup(request({}), MARKED, grantsFor(user()));

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('без метки Authorization не читается: только bearer — 401, bearer рядом с cookie не мешает', async () => {
    const grants = grantsFor(user());
    const bearerOnly = setup(bearerRequest(), {}, grants);
    const withCookie = setup(
      bearerRequest({ headers: { cookie: sessionCookie() } }),
      {},
      grants,
    );

    await expect(bearerOnly.guard.canActivate(bearerOnly.context)).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
    await expect(withCookie.guard.canActivate(withCookie.context)).resolves.toBe(true);
    expect(grants.authenticate).not.toHaveBeenCalled();
  });

  it('заблокированный по bearer — 403', async () => {
    const grants = grantsFor(new NativeAuthError('account_blocked'));
    const { guard, context } = setup(bearerRequest(), MARKED, grants);

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('негодный, отозванный, истёкший, неизвестный, удалённый (всё invalid_token) — 401', async () => {
    const grants = grantsFor(new NativeAuthError('invalid_token'));
    const { guard, context } = setup(bearerRequest(), MARKED, grants);

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it.each([
    ['другая схема', ['Basic abc']],
    ['пустой заголовок', ['']],
    ['повтор заголовка', [`Bearer ${TOKEN}`, `Bearer ${TOKEN}`]],
  ])('%s — 401 без обращения к базе доступов', async (_name, authorization) => {
    const grants = grantsFor(user());
    const { guard, context } = setup(request({ authorization }), MARKED, grants);

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedError);
    expect(grants.authenticate).not.toHaveBeenCalled();
  });

  it('сбой базы не превращается в 401/403, а идёт дальше (500)', async () => {
    const failure = new Error('mongo упал');
    const { guard, context } = setup(bearerRequest(), MARKED, grantsFor(failure));

    await expect(guard.canActivate(context)).rejects.toBe(failure);
  });

  it('любой другой отказ нативной проверки — 401', async () => {
    const { guard, context } = setup(
      bearerRequest(),
      MARKED,
      grantsFor(new NativeAuthError('invalid_request')),
    );

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('@Roles и режим ученика действуют и на bearer', async () => {
    const forbidden = setup(
      bearerRequest(),
      { ...MARKED, [ROLES_KEY]: ['admin'] },
      grantsFor(user({ roles: ['teacher'] })),
    );
    const student = setup(
      bearerRequest(),
      MARKED,
      grantsFor(user({ roles: ['admin'], studentMode: true })),
    );

    await expect(forbidden.guard.canActivate(forbidden.context)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(student.guard.canActivate(student.context)).resolves.toBe(true);
    expect(requestOf(student.context).user).toMatchObject({
      roles: [],
      studentMode: true,
    });
  });
});

describe('AuthGuard — CSRF и bearer', () => {
  it('мутирующий запрос по bearer без x-requested-with проходит', async () => {
    const { guard, context } = setup(
      bearerRequest({ method: 'PATCH' }),
      MARKED,
      grantsFor(user()),
    );

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('мутирующий запрос по cookie без x-requested-with — 403, как и раньше', async () => {
    const headers = { cookie: sessionCookie() };
    const { guard, context } = setup(
      request({ method: 'PATCH', headers }),
      MARKED,
      grantsFor(user()),
    );

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it.each([
    ['без x-requested-with', { cookie: sessionCookie() }],
    ['с x-requested-with', { cookie: sessionCookie(), 'x-requested-with': 'fetch' }],
  ])(
    'мутирующий запрос с bearer и живой cookie %s — 400 ambiguous_credentials',
    async (_name, headers) => {
      const { guard, context } = setup(
        bearerRequest({ method: 'PATCH', headers }),
        MARKED,
        grantsFor(user()),
      );

      await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
        AmbiguousCredentialsError,
      );
    },
  );

  it('без метки bearer CSRF не отменяет: PATCH с одним Authorization — 403', async () => {
    const { guard, context } = setup(
      bearerRequest({ method: 'PATCH' }),
      {},
      grantsFor(user()),
    );

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('@SkipCsrf() на маршруте с bearer ничего не меняет в выборе credential', async () => {
    const { guard, context } = setup(
      bearerRequest({ method: 'PATCH' }),
      { ...MARKED, [SKIP_CSRF_KEY]: true },
      grantsFor(user()),
    );

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });
});
