// e2e на /users/invite-link (ADR-0030) — доступ только admin (данные школы,
// ADR-0010), в ответе нет codeHash/code в открытом виде. Настоящий AppModule
// на MongoMemoryServer.
import request from 'supertest';
import type { ApiErrorBody, InviteLinkDto } from '@xuanxue/shared';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { sessionCookieFor, withCsrf } from './e2e-support/http';

describe('Invite link (e2e)', () => {
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

  function getInviteLink(cookie?: string): request.Test {
    const req = request(server()).get('/api/users/invite-link');
    return cookie ? req.set('Cookie', cookie) : req;
  }

  function postInviteLink(cookie: string): request.Test {
    return withCsrf(request(server()).post('/api/users/invite-link')).set(
      'Cookie',
      cookie,
    );
  }

  function checkInvite(code: string): request.Test {
    return withCsrf(request(server()).post('/api/auth/join/check')).send({ code });
  }

  it('без сессии — 401', async () => {
    const res = await getInviteLink();
    expect(res.status).toBe(401);
    expect((res.body as ApiErrorBody).code).toBe('unauthorized');
  });

  it('учитель и ученик — 403', async () => {
    const teacherCookie = await sessionCookieFor(testApp.app, ['teacher']);
    const studentCookie = await sessionCookieFor(testApp.app, []);

    expect((await getInviteLink(teacherCookie)).status).toBe(403);
    expect((await getInviteLink(studentCookie)).status).toBe(403);
  });

  it('admin: GET без ссылки — url: null, POST создаёт, повторный GET её отдаёт', async () => {
    const adminCookie = await sessionCookieFor(testApp.app, ['admin']);

    const before = await getInviteLink(adminCookie);
    expect(before.status).toBe(200);
    expect((before.body as InviteLinkDto).url).toBeNull();

    const created = await postInviteLink(adminCookie);
    expect(created.status).toBe(200);
    const { url } = created.body as InviteLinkDto;
    expect(url).toMatch(/\/join\/[0-9a-f]{32}$/);

    const after = await getInviteLink(adminCookie);
    expect((after.body as InviteLinkDto).url).toBe(url);
  });

  it('в ответе нет codeHash', async () => {
    const adminCookie = await sessionCookieFor(testApp.app, ['admin']);
    const created = await postInviteLink(adminCookie);
    expect(JSON.stringify(created.body)).not.toContain('codeHash');
  });

  it('POST второй раз меняет url, старый код перестаёт проходить check', async () => {
    const adminCookie = await sessionCookieFor(testApp.app, ['admin']);
    const first = await postInviteLink(adminCookie);
    const firstUrl = (first.body as InviteLinkDto).url as string;
    const firstCode = firstUrl.split('/join/')[1] as string;
    expect((await checkInvite(firstCode)).body).toEqual({ valid: true });

    const second = await postInviteLink(adminCookie);
    const secondUrl = (second.body as InviteLinkDto).url as string;

    expect(secondUrl).not.toBe(firstUrl);
    expect((await checkInvite(firstCode)).body).toEqual({ valid: false });
  });
});
