// Исходы входа из wiki (ADR-0183) без HTTP и без Mongo: сессию читает настоящий
// AuthService, человека — фейк с тем же `findById`, чтобы смена его контракта
// не прошла молча.
import { Logger } from '@nestjs/common';
import { DateTime } from 'luxon';
import { NotFoundError } from '../common/errors';
import { AuthService } from '../auth/auth.service';
import { sessionCookieProfile } from '../auth/session-cookie';
import { SESSION_MAX_AGE_SEC } from '../auth/session-token';
import type { UserLean, UsersService } from '../users/users.service';
import { wikiLoginPath, type WikiEntryOutcome } from './wiki-entry';
import {
  WIKI_ENTRY_BLOCKED,
  WIKI_ENTRY_INVALID,
  WIKI_ENTRY_UNAVAILABLE,
} from './wiki-entry-response';
import { WikiEntryService } from './wiki-entry.service';

const SECRET = 'w'.repeat(32);
const NOW = DateTime.fromISO('2026-10-10T12:00:00Z', { zone: 'utc' });
const WIKI = 'https://wiki.xuanxue.su';
const QUERY = 'returnTo=%2Fa%3Fx%3D1';

function user(status: UserLean['status'] = 'active'): UserLean {
  return { id: 'u1', name: 'Мария', roles: [], status, studentMode: false };
}

function build(
  options: { publicUrl?: string; findById?: jest.Mock<Promise<UserLean | null>> } = {},
) {
  const auth = new AuthService(
    SECRET,
    sessionCookieProfile(options.publicUrl ?? 'https://xuanxue.su'),
  );
  const findById = options.findById ?? jest.fn().mockResolvedValue(user());
  const users = { findById } satisfies Pick<UsersService, 'findById'>;
  const service = new WikiEntryService(auth, users as unknown as UsersService);
  const { token } = auth.issueSession('u1', NOW);
  return { service, auth, findById, token };
}

function request(query: string | undefined, cookie?: string) {
  return {
    id: 'req-1',
    originalUrl: query === undefined ? '/wiki' : `/wiki?${query}`,
    headers: cookie ? { cookie } : {},
  };
}

describe('WikiEntryService.enter', () => {
  afterEach(() => jest.restoreAllMocks());

  it('локальный профиль — NotFoundError: ответит общий фильтр, как на неизвестный адрес', async () => {
    const { service, token } = build({ publicUrl: 'http://localhost:3000' });
    await expect(
      service.enter(request(QUERY, `session=${token}`), NOW),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('плохой returnTo — страница 400, база не опрашивается', async () => {
    const { service, findById, token } = build();
    const outcome = await service.enter(
      request('returnTo=https%3A%2F%2Fevil.example', `session=${token}`),
      NOW,
    );
    expect(outcome).toBe(WIKI_ENTRY_INVALID);
    expect(findById).not.toHaveBeenCalled();
  });

  it('плохой returnTo важнее отсутствия сессии: 400, а не вход', async () => {
    const { service } = build();
    expect(await service.enter(request('x=1'), NOW)).toBe(WIKI_ENTRY_INVALID);
  });

  it('нет сессии — переход на вход с возвратом на этот же маршрут', async () => {
    const { service, findById } = build();
    expect(await service.enter(request(QUERY), NOW)).toEqual({
      kind: 'redirect',
      location: wikiLoginPath('/a?x=1'),
    });
    expect(findById).not.toHaveBeenCalled();
  });

  it('аккаунт удалён — тот же переход на вход, без cookie', async () => {
    const { service, token } = build({
      findById: jest.fn().mockResolvedValue(null),
    });
    const outcome = await service.enter(request(QUERY, `session=${token}`), NOW);
    expect(outcome).toEqual({ kind: 'redirect', location: wikiLoginPath('/a?x=1') });
  });

  it('заблокирован — страница 403, без перехода и cookie', async () => {
    const { service, token } = build({
      findById: jest.fn().mockResolvedValue(user('blocked')),
    });
    const outcome = await service.enter(request(QUERY, `session=${token}`), NOW);
    expect(outcome).toBe(WIKI_ENTRY_BLOCKED);
  });

  it('активный — переход на wiki с тем же токеном и остатком срока', async () => {
    const { service, auth, findById, token } = build();
    const outcome = await service.enter(
      request(QUERY, `session=${token}`),
      NOW.plus({ hours: 1 }),
    );
    expect(findById).toHaveBeenCalledWith('u1');
    expect(outcome).toEqual<WikiEntryOutcome>({
      kind: 'redirect',
      location: `${WIKI}/a?x=1`,
      cookies: [
        'session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0; Secure',
        `session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_MAX_AGE_SEC - 3600}; Domain=xuanxue.su; Secure`,
      ],
    });
    expect(auth.wikiOrigin()).toBe(WIKI);
  });

  it('сбой базы — страница 503 и error-лог со стеком, не вход и не cookie', async () => {
    const boom = new Error('connect ECONNREFUSED');
    const log = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    const { service, token } = build({ findById: jest.fn().mockRejectedValue(boom) });
    const outcome = await service.enter(request(QUERY, `session=${token}`), NOW);
    expect(outcome).toBe(WIKI_ENTRY_UNAVAILABLE);
    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining('requestId=req-1'),
      boom.stack,
    );
  });
});
