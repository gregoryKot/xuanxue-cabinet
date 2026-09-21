// e2e POST /auth/email/code (ADR-0104) — Resend подключён (RESEND_API_KEY/
// MAIL_FROM через envOverrides), тот же приём createTestApp, что у
// auth-email-verify.e2e-spec.ts, общий setup через createEmailVerifyHelpers
// (e2e-support/auth-email-verify-fixtures.ts). MailService подменён фейком
// (fake-mail-service.ts) — сеть не трогаем (CLAUDE.md «Тесты»). Код —
// второй способ потратить ту же заявку, что и ссылка: сценарии перебора
// попыток и «один способ гасит другой» — то, чего у входа по ссылке нет.
import {
  ACCESS_MESSAGE,
  EMAIL_LOGIN_CODE_INVALID_MESSAGE,
  NEW_PERSON_NAME,
  NO_INVITE_LINK_MESSAGE,
  type ApiErrorBody,
  type MeDto,
} from '@xuanxue/shared';
import request from 'supertest';
import { EMAIL_LOGIN_CODE_MAX_ATTEMPTS } from '../src/auth/email-login-token.service';
import { MailService } from '../src/mail/mail.service';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import {
  createEmailVerifyHelpers,
  freshIp,
} from './e2e-support/auth-email-verify-fixtures';
import {
  createFakeMailService,
  type FakeMailService,
} from './e2e-support/fake-mail-service';

describe('POST /auth/email/code (e2e), Resend подключён', () => {
  let testApp: TestApp;
  let fakeMail: FakeMailService;
  const helpers = createEmailVerifyHelpers(
    () => testApp,
    () => fakeMail,
  );

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

  it('новый email без inviteCode — 403, аккаунт не создаётся', async () => {
    await helpers.postRequest('code-no-invite@example.com', freshIp());
    const code = helpers.lastSentCode();

    const res = await helpers.postCode('code-no-invite@example.com', code, freshIp());

    expect(res.status).toBe(403);
    expect((res.body as ApiErrorBody).message).toBe(NO_INVITE_LINK_MESSAGE);
    await expect(
      helpers.userModel().countDocuments({ email: 'code-no-invite@example.com' }),
    ).resolves.toBe(0);
  });

  it('новый email с валидным inviteCode и кодом из письма — 200, cookie, /auth/me отвечает', async () => {
    const invite = await helpers.currentInviteCode();
    await helpers.postRequest('code-flow@example.com', freshIp());
    const code = helpers.lastSentCode();

    const res = await helpers.postCode('code-flow@example.com', code, freshIp(), invite);

    expect(res.status).toBe(200);
    const body = res.body as MeDto;
    expect(body.status).toBe('active');
    expect(body.name).toBe(NEW_PERSON_NAME);
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toContain('session=');

    const me = await request(helpers.server()).get('/api/auth/me').set('Cookie', cookie);
    expect(me.status).toBe(200);
    expect((me.body as MeDto).status).toBe('active');
  });

  it('неверный код — 401 с EMAIL_LOGIN_CODE_INVALID_MESSAGE', async () => {
    await helpers.postRequest('code-wrong@example.com', freshIp());

    const res = await helpers.postCode('code-wrong@example.com', '000000', freshIp());

    expect(res.status).toBe(401);
    expect((res.body as ApiErrorBody).message).toBe(EMAIL_LOGIN_CODE_INVALID_MESSAGE);
  });

  it(`${EMAIL_LOGIN_CODE_MAX_ATTEMPTS} неверных попыток, потом верный — тоже 401 (заявка сгорела)`, async () => {
    const invite = await helpers.currentInviteCode();
    await helpers.postRequest('code-locked@example.com', freshIp());
    const code = helpers.lastSentCode();

    for (let i = 0; i < EMAIL_LOGIN_CODE_MAX_ATTEMPTS; i += 1) {
      const attempt = await helpers.postCode(
        'code-locked@example.com',
        '000000',
        freshIp(),
      );
      expect(attempt.status).toBe(401);
    }

    const last = await helpers.postCode(
      'code-locked@example.com',
      code,
      freshIp(),
      invite,
    );
    expect(last.status).toBe(401);
    await expect(
      helpers.userModel().countDocuments({ email: 'code-locked@example.com' }),
    ).resolves.toBe(0);
  });

  it('код одноразов — второй раз тем же кодом 401', async () => {
    const invite = await helpers.currentInviteCode();
    await helpers.postRequest('code-once@example.com', freshIp());
    const code = helpers.lastSentCode();

    const first = await helpers.postCode(
      'code-once@example.com',
      code,
      freshIp(),
      invite,
    );
    expect(first.status).toBe(200);

    const second = await helpers.postCode('code-once@example.com', code, freshIp());
    expect(second.status).toBe(401);
  });

  it('вход по коду сжигает ссылку той же заявки (ADR-0104) — она отвечает 401', async () => {
    const invite = await helpers.currentInviteCode();
    await helpers.postRequest('code-burns-link@example.com', freshIp());
    const link = helpers.lastSentLink();
    const code = helpers.lastSentCode();

    const byCode = await helpers.postCode(
      'code-burns-link@example.com',
      code,
      freshIp(),
      invite,
    );
    expect(byCode.status).toBe(200);

    const token = new URL(link).searchParams.get('token') ?? '';
    const byLink = await helpers.postVerify(token, freshIp());
    expect(byLink.status).toBe(401);
  });

  it('blocked — 403, статус в базе не меняется', async () => {
    await helpers.userModel().create({
      name: 'Заблокирована',
      email: 'code-blocked@example.com',
      roles: [],
      status: 'blocked',
    });
    await helpers.postRequest('code-blocked@example.com', freshIp());
    const code = helpers.lastSentCode();

    const res = await helpers.postCode('code-blocked@example.com', code, freshIp());

    expect(res.status).toBe(403);
    expect((res.body as ApiErrorBody).message).toBe(ACCESS_MESSAGE);
    const stillBlocked = await helpers
      .userModel()
      .findOne({ email: 'code-blocked@example.com' })
      .lean();
    expect(stillBlocked?.status).toBe('blocked');
  });
});
