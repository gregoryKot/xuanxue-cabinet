// e2e бюджета GET /api/auth/native/me на настоящем AppModule (ADR-0184,
// контракт Workshop native-content-session a07f087, C09–C12): бэкенд Daychi
// проверяет bearer каждого читателя с одного IP, поэтому подтверждённый доступ
// считается по своему гранту, а не по IP, и не упирается ни в нативный, ни в
// глобальный лимит по IP. Окно — на зафиксированных часах Luxon.
import request from 'supertest';
import type { NativeTokenResponse } from '@xuanxue/shared';
import { NATIVE_ME_LIMIT } from '../src/native-auth/native-me-limiter';
import {
  NATIVE_BASE,
  THRESHOLD,
  T0,
  bearer,
  expectOnlyError,
  issueNativeGrant,
  pinTime,
  useNativeApi,
} from './e2e-support/native-fixtures';
import { createUserWithSession } from './e2e-support/session';
import { freshIp } from './e2e-support/telegram-widget-fixtures';

// Больше и нативного (60), и глобального (120) лимита по IP.
const GRANTS_BEHIND_ONE_IP = 3;
const UNKNOWN_TOKEN = 'q'.repeat(43);

describe('нативный вход Daychi: бюджет me по гранту (e2e)', () => {
  const api = useNativeApi();
  const { app, server, renew } = api;

  const meFrom = (ip: string, token: string): request.Test =>
    request(server())
      .get(`${NATIVE_BASE}/me`)
      .set('x-forwarded-for', ip)
      .set('Authorization', bearer(token));

  async function grantFor(
    userId?: string,
  ): Promise<NativeTokenResponse & { userId: string }> {
    const owner =
      userId ??
      (await createUserWithSession(app(), { name: 'Читатель', roles: [] })).userId;
    return { ...(await issueNativeGrant(app(), owner)), userId: owner };
  }

  async function spend(ip: string, token: string, count: number): Promise<void> {
    for (let i = 0; i < count; i++) expect((await meFrom(ip, token)).status).toBe(200);
  }

  function expectLimited(res: request.Response, retryAfterSec: number): void {
    expectOnlyError(res, 429, 'rate_limited');
    expect(res.headers['retry-after']).toBe(String(retryAfterSec));
  }

  it('C09: исчерпанный грант A — 429, грант B за тем же IP — 200', async () => {
    pinTime(T0);
    const ip = freshIp();
    const a = await grantFor();
    const b = await grantFor();

    await spend(ip, a.access_token, NATIVE_ME_LIMIT);

    expectLimited(await meFrom(ip, a.access_token), 60);
    expect((await meFrom(ip, b.access_token)).status).toBe(200);
  });

  it('C09: гранты за одним IP не складываются ни в нативный, ни в глобальный лимит', async () => {
    pinTime(T0);
    const ip = freshIp();
    const grants = [];
    for (let i = 0; i < GRANTS_BEHIND_ONE_IP; i++) grants.push(await grantFor());

    for (const grant of grants) await spend(ip, grant.access_token, NATIVE_ME_LIMIT);

    for (const grant of grants) expectLimited(await meFrom(ip, grant.access_token), 60);
  });

  it('C10: продлённый и прежний bearer — один бюджет, второй грант того же человека — свой', async () => {
    pinTime(T0);
    const ip = freshIp();
    const first = await grantFor();
    const second = await grantFor(first.userId);
    pinTime(T0.plus({ seconds: THRESHOLD + 1 }));
    const renewed = (await renew(first.access_token)).body as NativeTokenResponse;
    expect(renewed.session_id).toBe(first.session_id);
    expect(renewed.access_token).not.toBe(first.access_token);

    await spend(ip, first.access_token, NATIVE_ME_LIMIT / 2);
    await spend(ip, renewed.access_token, NATIVE_ME_LIMIT / 2);

    expectLimited(await meFrom(ip, first.access_token), 60);
    expectLimited(await meFrom(ip, renewed.access_token), 60);
    expect((await meFrom(ip, second.access_token)).status).toBe(200);
  });

  it('C11: место освобождается ровно на 60-й секунде, отказы окно не продлевают', async () => {
    pinTime(T0);
    const ip = freshIp();
    const { access_token: token } = await grantFor();
    await spend(ip, token, NATIVE_ME_LIMIT);

    pinTime(T0.plus({ seconds: 30 }));
    expectLimited(await meFrom(ip, token), 30);
    pinTime(T0.plus({ seconds: 59 }));
    expectLimited(await meFrom(ip, token), 1);
    pinTime(T0.plus({ seconds: 60 }));

    expect((await meFrom(ip, token)).status).toBe(200);
  });

  it('C12: мусор с IP Daychi упирается в лимит по IP, бюджет читателя за тем же IP цел', async () => {
    pinTime(T0);
    const ip = freshIp();
    const reader = await grantFor();
    // Заголовки с чужим грантом и аккаунтом ключ бюджета не выбирают.
    const garbage = (): request.Test =>
      meFrom(ip, UNKNOWN_TOKEN)
        .set('X-Native-Grant', reader.session_id)
        .set('X-Account-Id', reader.userId);

    for (let i = 0; i < NATIVE_ME_LIMIT; i++) {
      expectOnlyError(await garbage(), 401, 'invalid_token');
    }
    expectLimited(await garbage(), 60);

    await spend(ip, reader.access_token, NATIVE_ME_LIMIT);
    expectLimited(await meFrom(ip, reader.access_token), 60);
  });
});
