// Общее для e2e нативного входа Daychi (ADR-0181): выдача доступа напрямую
// сервисом для проверки bearer-маршрутов, запросы к ним, ожидания про заголовки
// и управление временем через Luxon `Settings.now` (CLAUDE.md «Детерминизм»).
// Браузерная часть входа — native-browser-fixtures.ts.
import type { NestExpressApplication } from '@nestjs/platform-express';
import { getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import request from 'supertest';
import { DateTime, Settings } from 'luxon';
import {
  NATIVE_CLIENT_ID,
  NATIVE_CREDENTIAL_LIFETIME_SEC,
  NATIVE_RENEW_THRESHOLD_SEC,
  type NativeTokenResponse,
} from '@xuanxue/shared';
import { USER_MODEL_NAME } from '../../src/users/user-data.registry';
import type { UserRecord } from '../../src/users/user.schema';
import { NativeGrantsService } from '../../src/native-auth/native-grants.service';
import { createTestApp, type TestApp } from './create-app';
import { createUserWithSession } from './session';

export const NATIVE_BASE = '/api/auth/native';
export const LIFETIME = NATIVE_CREDENTIAL_LIFETIME_SEC;
export const THRESHOLD = NATIVE_RENEW_THRESHOLD_SEC;
export const FORM = `client_id=${NATIVE_CLIENT_ID}`;

// Отсчёт от настоящих часов, а не от литерала: TTL-индексы Mongo живут по часам
// сервера базы, и срок из прошлого стёр бы запись посреди теста.
export const T0 = DateTime.utc().startOf('second');

const REAL_NOW = Settings.now;

/** Часы Luxon (а значит и `DateTime.utc()` контроллеров) встают на `at`. */
export function pinTime(at: DateTime): void {
  Settings.now = () => at.toMillis();
}

/** Возвращает настоящие часы — иначе время утечёт в соседние тесты. */
export function unpinTime(): void {
  Settings.now = REAL_NOW;
}

export function bearer(token: string): string {
  return `Bearer ${token}`;
}

/** Доступ и первый bearer на текущем (возможно, зафиксированном) времени. */
export function issueNativeGrant(
  app: NestExpressApplication,
  userId: string,
): Promise<NativeTokenResponse> {
  return app.get(NativeGrantsService).issueGrant(userId, DateTime.utc());
}

/** Заголовки любого нативного ответа: не кешировать, cookie не ставить. */
export function expectNativeHeaders(res: request.Response): void {
  expect(res.headers['cache-control']).toBe('no-store');
  expect(res.headers.pragma).toBe('no-cache');
  expect(res.headers['set-cookie']).toBeUndefined();
}

/** Ошибка нативного профиля: в теле только `{error}`. */
export function expectOnlyError(
  res: request.Response,
  status: number,
  code: string,
): void {
  expect(res.status).toBe(status);
  expect(res.body).toEqual({ error: code });
  expectNativeHeaders(res);
}

export interface NativeApi {
  app: () => NestExpressApplication;
  server: () => ReturnType<TestApp['app']['getHttpServer']>;
  users: () => Model<UserRecord>;
  me: (token: string) => request.Test;
  renew: (token: string) => request.Test;
  revoke: (token: string) => request.Test;
  person: (name?: string) => Promise<{ userId: string; token: string }>;
}

/** Поднимает AppModule на файл и возвращает запросы к нативным маршрутам. */
export function useNativeApi(): NativeApi {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp();
  }, 60_000);
  afterAll(async () => {
    await testApp.close();
  });
  afterEach(unpinTime);

  const app = (): NestExpressApplication => testApp.app;
  const server = (): ReturnType<TestApp['app']['getHttpServer']> =>
    testApp.app.getHttpServer();

  return {
    app,
    server,
    users: () =>
      app().get<Model<UserRecord>>(getModelToken(USER_MODEL_NAME), { strict: false }),
    me: (token) =>
      request(server()).get(`${NATIVE_BASE}/me`).set('Authorization', bearer(token)),
    renew: (token) =>
      request(server())
        .post(`${NATIVE_BASE}/renew`)
        .set('Authorization', bearer(token))
        .send({}),
    revoke: (token) =>
      request(server())
        .post(`${NATIVE_BASE}/revoke`)
        .type('form')
        .send(`${FORM}&token=${token}`),
    person: async (name = 'Ученик') => {
      const { userId } = await createUserWithSession(app(), { name, roles: [] });
      const grant = await issueNativeGrant(app(), userId);
      return { userId, token: grant.access_token };
    },
  };
}
