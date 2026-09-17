// e2e POST /auth/email/request — Resend подключён (RESEND_API_KEY/MAIL_FROM
// через envOverrides). Отдельный файл от auth-email.e2e-spec.ts (см.
// комментарий там про кеш импорта AppModule на файл) и от
// auth-email-verify.e2e-spec.ts (файловый храповик, CLAUDE.md «Храповики») —
// verify живёт своим набором тестов, request — своим. MailService подменён
// фейком (fake-mail-service.ts) — сеть не трогаем (CLAUDE.md «Тесты»).
import { getModelToken } from '@nestjs/mongoose';
import request from 'supertest';
import type { Model } from 'mongoose';
import { MailService } from '../src/mail/mail.service';
import { UserRecord } from '../src/users/user.schema';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import {
  createFakeMailService,
  type FakeMailService,
} from './e2e-support/fake-mail-service';

let lastIpOctet = 0;
function freshIp(): string {
  lastIpOctet += 1;
  return `203.0.113.${lastIpOctet}`;
}

describe('POST /auth/email/request (e2e), Resend подключён', () => {
  let testApp: TestApp;
  let fakeMail: FakeMailService;

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

  it('известный email — 204, письмо действительно ушло', async () => {
    const userModel = testApp.app.get<Model<UserRecord>>(getModelToken(UserRecord.name), {
      strict: false,
    });
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

    const link = fakeMail.sent[fakeMail.sent.length - 1]?.link ?? '';
    expect(link).toMatch(/^http:\/\/localhost:3000\/login\/email\?token=[0-9a-f]{64}$/);
  });
});
