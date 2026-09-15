// e2e POST /auth/email/request и /verify — Resend подключён (RESEND_API_KEY/
// MAIL_FROM через envOverrides). Отдельный файл от auth-email.e2e-spec.ts
// (см. комментарий там про кеш импорта AppModule на файл). MailService
// подменён фейком (fake-mail-service.ts) — сеть не трогаем (CLAUDE.md
// «Тесты»); сырой токен теста берёт из перехваченной ссылки, как это сделал
// бы человек, открывший письмо (в базе — только sha256, SECURITY §2).
import { getModelToken } from '@nestjs/mongoose';
import request from 'supertest';
import type { Model } from 'mongoose';
import type { MeDto } from '@xuanxue/shared';
import { MailService } from '../src/mail/mail.service';
import { UserRecord } from '../src/users/user.schema';
import { createTestApp, type TestApp } from './e2e-support/create-app';
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

describe('POST /auth/email/request и /verify (e2e), Resend подключён', () => {
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

  function postVerify(token: string, ip: string): request.Test {
    return request(server())
      .post('/api/auth/email/verify')
      .set('x-requested-with', 'fetch')
      .set('x-forwarded-for', ip)
      .send({ token });
  }

  function lastSentLink(): string {
    return fakeMail.sent[fakeMail.sent.length - 1]?.link ?? '';
  }

  it('известный email — 204, письмо действительно ушло', async () => {
    await userModel.create({
      name: 'Дима',
      email: 'dima@example.com',
      roles: ['teacher'],
      status: 'active',
    });
    const before = fakeMail.sent.length;

    const res = await postRequest('dima@example.com', freshIp());

    expect(res.status).toBe(204);
    expect(fakeMail.sent.length).toBe(before + 1);
    expect(fakeMail.sent[before]?.to).toBe('dima@example.com');
  });

  it('неизвестный email — тот же 204, письмо тоже уходит (аккаунт не раскрываем)', async () => {
    const before = fakeMail.sent.length;

    const res = await postRequest('незнакомец@example.com', freshIp());

    expect(res.status).toBe(204);
    expect(fakeMail.sent.length).toBe(before + 1);
  });

  it('cooldown: второй request за 2 минуты не шлёт письмо второй раз, ответ всё равно 204', async () => {
    const email = 'cooldown-test@example.com';
    const first = await postRequest(email, freshIp());
    expect(first.status).toBe(204);
    const afterFirst = fakeMail.sent.length;

    const second = await postRequest(email, freshIp());

    expect(second.status).toBe(204);
    expect(fakeMail.sent.length).toBe(afterFirst);
  });

  it('ссылка ведёт на PUBLIC_URL/login/email с 64-hex токеном', async () => {
    await postRequest('link-shape@example.com', freshIp());

    expect(lastSentLink()).toMatch(
      /^http:\/\/localhost:3000\/login\/email\?token=[0-9a-f]{64}$/,
    );
  });

  it('verify: успешный вход по ссылке из письма — cookie сессии, MeDto invited, /auth/me подтверждает', async () => {
    await postRequest('verify-flow@example.com', freshIp());
    const token = tokenFromLink(lastSentLink());

    const res = await postVerify(token, freshIp());

    expect(res.status).toBe(200);
    const body = res.body as MeDto;
    expect(body.status).toBe('invited');
    expect(body.roles).toEqual([]);
    // Только поля MeDto — email/tokenHash в ответе нет (SECURITY §2, CLAUDE.md «API»).
    expect(Object.keys(body).sort()).toEqual(
      ['id', 'name', 'roles', 'status', 'tz'].sort(),
    );
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toContain('session=');

    const me = await request(server()).get('/api/auth/me').set('Cookie', cookie);
    expect(me.status).toBe(200);
    expect((me.body as MeDto).status).toBe('invited');
  });

  it('verify: повторное использование той же ссылки — 401', async () => {
    await postRequest('once-only@example.com', freshIp());
    const token = tokenFromLink(lastSentLink());
    const first = await postVerify(token, freshIp());
    expect(first.status).toBe(200);

    const second = await postVerify(token, freshIp());
    expect(second.status).toBe(401);
  });

  it('verify: существующий email — вход без создания второго пользователя', async () => {
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
