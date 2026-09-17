// e2e на POST /auth/join/check (ADR-0034) — страница `/join/<code>`
// проверяет ссылку до входа. Сам вход и присоединение к школе идут через
// POST /auth/telegram/POST /auth/email/verify с inviteCode
// (auth-telegram-invite.e2e-spec.ts, auth-email-verify.e2e-spec.ts) —
// отдельного POST /auth/join не осталось.
import request from 'supertest';
import type { ApiErrorBody, InviteLinkDto } from '@xuanxue/shared';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { sessionCookieFor, withCsrf } from './e2e-support/http';

let lastIpOctet = 0;
function freshIp(): string {
  lastIpOctet += 1;
  return `203.0.113.${lastIpOctet}`;
}

describe('POST /auth/join/check (e2e)', () => {
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

  function checkInvite(code: string, ip: string): request.Test {
    return withCsrf(request(server()).post('/api/auth/join/check'))
      .set('x-forwarded-for', ip)
      .send({ code });
  }

  it('действующий код — valid: true, чужой — false', async () => {
    const code = await currentInviteCode();

    expect((await checkInvite(code, freshIp())).body).toEqual({ valid: true });
    expect((await checkInvite('0'.repeat(32), freshIp())).body).toEqual({ valid: false });
  });

  it('11-й запрос с одного IP за минуту — 429 в конверте', async () => {
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
