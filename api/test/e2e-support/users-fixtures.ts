// Общие HTTP-хелперы для users.e2e-spec.ts — вынесено, чтобы спек уместился
// в лимит файл-храповика (CLAUDE.md «Храповики»), по образцу lessons-fixtures.ts.
import { getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import request from 'supertest';
import type { UserRole } from '@xuanxue/shared';
import { UserRecord } from '../../src/users/user.schema';
import { sessionCookieFor, withCsrf } from './http';
import type { TestApp } from './create-app';

/** `getApp` — геттер, не значение: как в lessons-fixtures.ts — вызывается
 * лениво из `it()`, когда `beforeAll` уже присвоил testApp. */
export function createUsersTestHelpers(getApp: () => TestApp) {
  const server = (): ReturnType<TestApp['app']['getHttpServer']> =>
    getApp().app.getHttpServer();
  const userModel = (): Model<UserRecord> =>
    getApp().app.get(getModelToken(UserRecord.name), { strict: false });

  /** По умолчанию — «просто кто-то вошёл, без роли»; `overrides` задаёт
   * только то, что нужно конкретному тесту (роль, telegramId, email). */
  function createUser(overrides: Record<string, unknown> = {}) {
    return userModel().create({
      name: 'Кто-то',
      roles: [],
      status: 'active',
      ...overrides,
    });
  }

  function getUsers(cookie: string): request.Test {
    return request(server()).get('/api/users').set('Cookie', cookie);
  }

  function patchUser(
    cookie: string,
    id: string,
    body: Record<string, unknown>,
  ): request.Test {
    return withCsrf(request(server()).patch(`/api/users/${id}`))
      .set('Cookie', cookie)
      .send(body);
  }

  function patchStatus(
    cookie: string,
    id: string,
    body: Record<string, unknown>,
  ): request.Test {
    return withCsrf(request(server()).patch(`/api/users/${id}/status`))
      .set('Cookie', cookie)
      .send(body);
  }

  return {
    server,
    userModel,
    sessionFor: (roles: UserRole[]): Promise<string> =>
      sessionCookieFor(getApp().app, roles),
    createUser,
    getUsers,
    patchUser,
    patchStatus,
  };
}
