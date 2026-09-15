// e2e на POST /auth/join и /auth/join/check (ADR-0030) — третий путь
// invited → active. Настоящий AppModule на MongoMemoryServer.
//
// Троттлинг: /auth/join/check — Throttle 10/60с по IP (без верифицированной
// идентичности для check, вошедшего ещё нет), freshIp() выдаёт новый IP
// каждому тесту кроме отдельного теста на 429 — тот же приём, что в
// auth-telegram.e2e-spec.ts. /auth/join — без отдельного Throttle (только
// общий ThrottlerGuard 120/мин/IP, см. комментарий в auth.controller.ts).
import request from 'supertest';
import type { ApiErrorBody, InviteLinkDto, MeDto } from '@xuanxue/shared';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { sessionCookieFor, withCsrf } from './e2e-support/http';
import { createUserWithSession } from './e2e-support/session';

let lastIpOctet = 0;
function freshIp(): string {
  lastIpOctet += 1;
  return `203.0.113.${lastIpOctet}`;
}

describe('POST /auth/join, /auth/join/check (e2e)', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp();
  }, 60_000);

  afterAll(async () => {
    await testApp.close();
  });

  function server(): ReturnType<TestApp['app']['getHttpServer']> {
    return testApp.app.getHttpServer();
  }

  async function currentInviteCode(): Promise<string> {
    const adminCookie = await sessionCookieFor(testApp.app, ['admin']);
    const res = await withCsrf(request(server()).post('/api/users/invite-link')).set(
      'Cookie',
      adminCookie,
    );
    const url = (res.body as InviteLinkDto).url as string;
    return url.split('/join/')[1] as string;
  }

  function join(cookie: string, code: string): request.Test {
    return withCsrf(request(server()).post('/api/auth/join'))
      .set('Cookie', cookie)
      .send({ code });
  }

  function checkInvite(code: string, ip: string): request.Test {
    return withCsrf(request(server()).post('/api/auth/join/check'))
      .set('x-forwarded-for', ip)
      .send({ code });
  }

  it('invited + верный код — active, GET /auth/me тоже active (read-after-write)', async () => {
    const code = await currentInviteCode();
    const { cookie } = await createUserWithSession(testApp.app, {
      name: 'Ждёт подтверждения',
      roles: [],
      status: 'invited',
    });

    const res = await join(cookie, code);
    expect(res.status).toBe(200);
    expect((res.body as MeDto).status).toBe('active');

    const me = await request(server()).get('/api/auth/me').set('Cookie', cookie);
    expect((me.body as MeDto).status).toBe('active');
  });

  it('неверный код — 401', async () => {
    const { cookie } = await createUserWithSession(testApp.app, {
      name: 'Ждёт подтверждения',
      roles: [],
      status: 'invited',
    });

    const res = await join(cookie, '0'.repeat(32));

    expect(res.status).toBe(401);
    expect((res.body as ApiErrorBody).code).toBe('unauthorized');
  });

  it('blocked — 403 даже с верным кодом', async () => {
    const code = await currentInviteCode();
    const { cookie } = await createUserWithSession(testApp.app, {
      name: 'Заблокирован',
      roles: [],
      status: 'blocked',
    });

    const res = await join(cookie, code);

    expect(res.status).toBe(403);
  });

  it('active повторно — 200 без ошибки, статус не меняется', async () => {
    const code = await currentInviteCode();
    const { cookie } = await createUserWithSession(testApp.app, {
      name: 'Уже в кабинете',
      roles: [],
      status: 'active',
    });

    const res = await join(cookie, code);

    expect(res.status).toBe(200);
    expect((res.body as MeDto).status).toBe('active');
  });

  it('без сессии — 401 (нужно войти любым способом сначала)', async () => {
    const code = await currentInviteCode();
    const res = await withCsrf(request(server()).post('/api/auth/join')).send({ code });
    expect(res.status).toBe(401);
  });

  it('POST /auth/join/check: действующий код — valid: true, чужой — false', async () => {
    const code = await currentInviteCode();

    expect((await checkInvite(code, freshIp())).body).toEqual({ valid: true });
    expect((await checkInvite('0'.repeat(32), freshIp())).body).toEqual({ valid: false });
  });

  it('POST /auth/join/check: 11-й запрос с одного IP за минуту — 429 в конверте', async () => {
    const ip = freshIp();
    const code = await currentInviteCode();
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const res = await checkInvite(code, ip);
      expect(res.status).toBe(200);
    }

    const res = await checkInvite(code, ip);

    expect(res.status).toBe(429);
    expect((res.body as ApiErrorBody).code).toBe('rate_limited');
  });
});
