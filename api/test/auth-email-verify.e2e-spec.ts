// e2e POST /auth/email/verify — Resend подключён (RESEND_API_KEY/MAIL_FROM
// через envOverrides), отделён от auth-email-resend.e2e-spec.ts (файловый
// храповик, CLAUDE.md «Храповики»): request и verify — разный набор тестов,
// каждый со своим AppModule. Новый человек без ссылки-приглашения
// (ADR-0030/0034, статуса «ждёт подтверждения» больше нет) не заводится
// вовсе — `inviteCode` идёт телом запроса (страница `/login/email` читает
// его из `?join=`, не подпись — в отличие от Telegram, тело verify ничем не
// подписано). MailService подменён фейком (fake-mail-service.ts).
import { getModelToken } from '@nestjs/mongoose';
import request from 'supertest';
import type { Model } from 'mongoose';
import type { InviteLinkDto, MeDto } from '@xuanxue/shared';
import { MailService } from '../src/mail/mail.service';
import { UserRecord } from '../src/users/user.schema';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { sessionCookieFor, withCsrf } from './e2e-support/http';
import {
  createFakeMailService,
  tokenFromLink,
  type FakeMailService,
} from './e2e-support/fake-mail-service';

let lastIpOctet = 0;
function freshIp(): string {
  lastIpOctet += 1;
  return `203.0.113.${lastIpOctet}`;
}

describe('POST /auth/email/verify (e2e), Resend подключён', () => {
  let testApp: TestApp;
  let fakeMail: FakeMailService;
  let userModel: Model<UserRecord>;

  beforeAll(async () => {
    fakeMail = createFakeMailService();
    testApp = await createTestApp(
      (builder) => {
        builder.overrideProvider(MailService).useValue(fakeMail.service);
      },
      {
        RESEND_API_KEY: 're_test_key',
        MAIL_FROM: 'Школа «Сюань-Сюэ» <school@xuanxue.su>',
      },
    );
    userModel = testApp.app.get<Model<UserRecord>>(getModelToken(UserRecord.name), {
      strict: false,
    });
  }, 60_000);

  afterAll(async () => {
    await testApp.close();
  });

  function server(): ReturnType<TestApp['app']['getHttpServer']> {
    return testApp.app.getHttpServer();
  }

  function postRequest(email: string, ip: string): request.Test {
    return request(server())
      .post('/api/auth/email/request')
      .set('x-requested-with', 'fetch')
      .set('x-forwarded-for', ip)
      .send({ email });
  }

  function postVerify(token: string, ip: string, inviteCode?: string): request.Test {
    return request(server())
      .post('/api/auth/email/verify')
      .set('x-requested-with', 'fetch')
      .set('x-forwarded-for', ip)
      .send(inviteCode ? { token, inviteCode } : { token });
  }

  function lastSentLink(): string {
    return fakeMail.sent[fakeMail.sent.length - 1]?.link ?? '';
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

  it('новый email без inviteCode — 403, аккаунт не создаётся', async () => {
    await postRequest('no-invite@example.com', freshIp());
    const token = tokenFromLink(lastSentLink());

    const res = await postVerify(token, freshIp());

    expect(res.status).toBe(403);
    await expect(
      userModel.countDocuments({ email: 'no-invite@example.com' }),
    ).resolves.toBe(0);
  });

  it('новый email с валидным inviteCode — 200, active, joinedViaInvite, /auth/me подтверждает', async () => {
    const code = await currentInviteCode();
    await postRequest('verify-flow@example.com', freshIp());
    const token = tokenFromLink(lastSentLink());

    const res = await postVerify(token, freshIp(), code);

    expect(res.status).toBe(200);
    const body = res.body as MeDto;
    expect(body.status).toBe('active');
    expect(body.roles).toEqual([]);
    expect(body.telegramLinked).toBe(false); // инцидент 2026-09-16, RUNBOOK §8.17
    // Только поля MeDto — email/tokenHash в ответе нет (SECURITY §2, CLAUDE.md «API»).
    expect(Object.keys(body).sort()).toEqual(
      ['id', 'name', 'roles', 'status', 'telegramLinked', 'tz'].sort(),
    );
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toContain('session=');

    const me = await request(server()).get('/api/auth/me').set('Cookie', cookie);
    expect(me.status).toBe(200);
    expect((me.body as MeDto).status).toBe('active');

    const created = await userModel.findOne({ email: 'verify-flow@example.com' }).lean();
    expect(created?.joinedViaInviteAt).toBeInstanceOf(Date);
  });

  it('повторное использование той же ссылки — 401', async () => {
    const code = await currentInviteCode();
    await postRequest('once-only@example.com', freshIp());
    const token = tokenFromLink(lastSentLink());
    const first = await postVerify(token, freshIp(), code);
    expect(first.status).toBe(200);

    const second = await postVerify(token, freshIp(), code);
    expect(second.status).toBe(401);
  });

  it('существующий email — вход без создания второго пользователя', async () => {
    await userModel.create({
      name: 'Маша',
      email: 'masha@example.com',
      roles: [],
      status: 'active',
    });
    await postRequest('masha@example.com', freshIp());
    const token = tokenFromLink(lastSentLink());

    const res = await postVerify(token, freshIp());

    expect(res.status).toBe(200);
    expect((res.body as MeDto).status).toBe('active');
    await expect(userModel.countDocuments({ email: 'masha@example.com' })).resolves.toBe(
      1,
    );
  });
});
