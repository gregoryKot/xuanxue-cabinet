// Юнит-спек гварда с фейковым ExecutionContext (без HTTP, без Mongo) — все
// ветки порядка проверок (см. комментарий в guard.ts).
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DateTime } from 'luxon';
import { ForbiddenError, UnauthorizedError } from '../common/errors';
import { fakeConfig, fakeResponse } from '../test-support/http-fakes';
import type { UserLean } from '../users/users.service';
import { UsersService } from '../users/users.service';
import { IS_PUBLIC_KEY, ROLES_KEY, SKIP_CSRF_KEY } from './auth.decorators';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import type { RequestLike, ResponseLike } from '../common/http-headers';
import { signSession, verifySession } from './session-token';

const SECRET = 'a'.repeat(32);
// Настоящее «сейчас», а не фиксированная дата: AuthGuard читает часы сам
// (`DateTime.utc()` внутри canActivate), подменить их нечем, а токены здесь
// строятся относительно текущего момента — «свежий» и «старше 7 дней».
// С фиксированной датой тест переворачивался сам собой: 2026-09-05 перестал
// быть свежим ровно через неделю, и 2026-09-12 уронил CI (CLAUDE.md
// «Детерминизм»: мигающий тест чинится в тот же день).
const NOW = DateTime.utc();

function fakeContext(
  request: Partial<RequestLike>,
  response: ResponseLike,
  metadata: Record<string, unknown> = {},
): { context: ExecutionContext; reflector: Reflector } {
  const reflector = {
    getAllAndOverride: (key: string) => metadata[key],
  } as unknown as Reflector;
  const req: RequestLike = { method: 'GET', headers: {}, ...request };
  const context = {
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => response,
    }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
  return { context, reflector };
}

function fakeUsersService(user: UserLean | null): UsersService {
  return { findById: () => Promise.resolve(user) } as unknown as UsersService;
}

function buildGuard(
  reflector: Reflector,
  usersService: UsersService,
  nodeEnv = 'development',
): AuthGuard {
  const authService = new AuthService(SECRET, fakeConfig(nodeEnv));
  return new AuthGuard(reflector, usersService, authService);
}

function activeUser(overrides: Partial<UserLean> = {}): UserLean {
  return {
    id: 'u1',
    name: 'Мария',
    roles: ['teacher'],
    tz: 'Asia/Jerusalem',
    status: 'active',
    ...overrides,
  };
}

describe('AuthGuard — CSRF (проверяется первой, даже для @Public())', () => {
  it('мутирующий метод без заголовка — 403, даже с @Public()', async () => {
    const res = fakeResponse();
    const { context, reflector } = fakeContext({ method: 'POST', headers: {} }, res, {
      [IS_PUBLIC_KEY]: true,
    });
    const guard = buildGuard(reflector, fakeUsersService(null));
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('@SkipCsrf() пропускает мутирующий запрос без заголовка (дальше — @Public())', async () => {
    const res = fakeResponse();
    const { context, reflector } = fakeContext({ method: 'POST', headers: {} }, res, {
      [IS_PUBLIC_KEY]: true,
      [SKIP_CSRF_KEY]: true,
    });
    const guard = buildGuard(reflector, fakeUsersService(null));
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('мутирующий метод с заголовком — CSRF пройден', async () => {
    const res = fakeResponse();
    const { context, reflector } = fakeContext(
      { method: 'POST', headers: { 'x-requested-with': 'fetch' } },
      res,
      { [IS_PUBLIC_KEY]: true },
    );
    const guard = buildGuard(reflector, fakeUsersService(null));
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });
});

describe('AuthGuard — @Public()', () => {
  it('GET без cookie проходит', async () => {
    const { context, reflector } = fakeContext({}, fakeResponse(), {
      [IS_PUBLIC_KEY]: true,
    });
    const guard = buildGuard(reflector, fakeUsersService(null));
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });
});

describe('AuthGuard — сессия', () => {
  it('нет cookie — 401', async () => {
    const { context, reflector } = fakeContext({}, fakeResponse());
    const guard = buildGuard(reflector, fakeUsersService(null));
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('битая cookie — 401', async () => {
    const { context, reflector } = fakeContext(
      { headers: { cookie: 'session=не-токен' } },
      fakeResponse(),
    );
    const guard = buildGuard(reflector, fakeUsersService(null));
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('валидный токен, но такого пользователя нет — 401', async () => {
    const token = signSession({ userId: 'gone', issuedAt: NOW }, SECRET);
    const { context, reflector } = fakeContext(
      { headers: { cookie: `session=${token}` } },
      fakeResponse(),
    );
    const guard = buildGuard(reflector, fakeUsersService(null));
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it('заблокированный пользователь — 403', async () => {
    const token = signSession({ userId: 'u1', issuedAt: NOW }, SECRET);
    const { context, reflector } = fakeContext(
      { headers: { cookie: `session=${token}` } },
      fakeResponse(),
    );
    const guard = buildGuard(
      reflector,
      fakeUsersService(activeUser({ status: 'blocked' })),
    );
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('валидная сессия без @Roles — доступ есть, req.user заполнен полным UserLean', async () => {
    const token = signSession({ userId: 'u1', issuedAt: NOW }, SECRET);
    const { context, reflector } = fakeContext(
      { headers: { cookie: `session=${token}` } },
      fakeResponse(),
    );
    const user = activeUser({ roles: [] });
    const guard = buildGuard(reflector, fakeUsersService(user));
    await expect(guard.canActivate(context)).resolves.toBe(true);
    const req = (context.switchToHttp().getRequest as () => RequestLike)();
    expect(req.user).toEqual(user);
  });
});

describe('AuthGuard — @Roles', () => {
  it('нет ни одной нужной роли — 403', async () => {
    const token = signSession({ userId: 'u1', issuedAt: NOW }, SECRET);
    const { context, reflector } = fakeContext(
      { headers: { cookie: `session=${token}` } },
      fakeResponse(),
      { [ROLES_KEY]: ['admin'] },
    );
    const guard = buildGuard(reflector, fakeUsersService(activeUser({ roles: [] })));
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('хотя бы одна нужная роль есть — доступ', async () => {
    const token = signSession({ userId: 'u1', issuedAt: NOW }, SECRET);
    const { context, reflector } = fakeContext(
      { headers: { cookie: `session=${token}` } },
      fakeResponse(),
      { [ROLES_KEY]: ['teacher', 'admin'] },
    );
    const guard = buildGuard(
      reflector,
      fakeUsersService(activeUser({ roles: ['teacher'] })),
    );
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });
});

describe('AuthGuard — rolling-перевыпуск', () => {
  it('токен свежий — Set-Cookie не выставляется', async () => {
    const token = signSession({ userId: 'u1', issuedAt: NOW }, SECRET);
    const res = fakeResponse();
    const { context, reflector } = fakeContext(
      { headers: { cookie: `session=${token}` } },
      res,
    );
    const guard = buildGuard(reflector, fakeUsersService(activeUser()));
    await guard.canActivate(context);
    expect(res.headers['Set-Cookie']).toBeUndefined();
  });

  it('токен старше 7 дней — гвард перевыпускает валидный новый токен', async () => {
    const issuedAt = NOW.minus({ days: 8 });
    const token = signSession({ userId: 'u1', issuedAt }, SECRET);
    const res = fakeResponse();
    const { context, reflector } = fakeContext(
      { headers: { cookie: `session=${token}` } },
      res,
    );
    const guard = buildGuard(reflector, fakeUsersService(activeUser()));
    await guard.canActivate(context);
    const setCookie = res.headers['Set-Cookie'];
    expect(setCookie).not.toContain('Max-Age=0');
    const newToken = (setCookie?.split(';')[0] ?? '').split('=')[1] ?? '';
    expect(verifySession(newToken, SECRET, NOW)?.sub).toBe('u1');
  });

  it('в production cookie перевыпускается с Secure', async () => {
    const issuedAt = NOW.minus({ days: 8 });
    const token = signSession({ userId: 'u1', issuedAt }, SECRET);
    const res = fakeResponse();
    const { context, reflector } = fakeContext(
      { headers: { cookie: `session=${token}` } },
      res,
    );
    const guard = buildGuard(reflector, fakeUsersService(activeUser()), 'production');
    await guard.canActivate(context);
    expect(res.headers['Set-Cookie']).toContain('Secure');
  });
});
