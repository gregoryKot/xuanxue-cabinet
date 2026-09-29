// Юнит-тест findSessionUser (session-user.ts) — фейковые AuthService/
// UsersService, без Mongo.
import { DateTime } from 'luxon';
import type { UserLean, UsersService } from '../users/users.service';
import type { AuthService } from './auth.service';
import { SESSION_COOKIE } from './session-cookie';
import { findSessionUser } from './session-user';

const NOW = DateTime.fromISO('2026-09-28T10:00:00Z');
const USER: UserLean = { id: 'u1', name: 'Анна', roles: [], status: 'active' };

function fakeAuth(verify: AuthService['verifySession']): AuthService {
  return { verifySession: verify } as unknown as AuthService;
}

function fakeUsers(findById: UsersService['findById']): UsersService {
  return { findById } as unknown as UsersService;
}

describe('findSessionUser', () => {
  it('cookie отсутствует — null, verifySession не зовётся', async () => {
    const auth = fakeAuth(() => {
      throw new Error('не должен был вызваться');
    });
    const users = fakeUsers(() => Promise.reject(new Error('не должен был вызваться')));

    await expect(findSessionUser(undefined, auth, users, NOW)).resolves.toBeNull();
  });

  it('токен есть, но не проходит проверку — null', async () => {
    const auth = fakeAuth(() => null);
    const users = fakeUsers(() => Promise.reject(new Error('не должен был вызваться')));

    await expect(
      findSessionUser(`${SESSION_COOKIE}=bad`, auth, users, NOW),
    ).resolves.toBeNull();
  });

  it('валидный токен — находит пользователя по payload.sub', async () => {
    const auth = fakeAuth(() => ({ sub: 'u1', iat: 0, exp: 0 }));
    const users = fakeUsers((id) => Promise.resolve(id === 'u1' ? USER : null));

    await expect(
      findSessionUser(`${SESSION_COOKIE}=good`, auth, users, NOW),
    ).resolves.toEqual(USER);
  });

  it('валидный токен, но пользователь уже удалён — null', async () => {
    const auth = fakeAuth(() => ({ sub: 'gone', iat: 0, exp: 0 }));
    const users = fakeUsers(() => Promise.resolve(null));

    await expect(
      findSessionUser(`${SESSION_COOKIE}=good`, auth, users, NOW),
    ).resolves.toBeNull();
  });
});
