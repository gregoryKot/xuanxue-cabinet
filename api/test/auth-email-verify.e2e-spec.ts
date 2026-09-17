// e2e POST /auth/email/verify — Resend подключён (RESEND_API_KEY/MAIL_FROM
// через envOverrides), отделён от auth-email-resend.e2e-spec.ts (файловый
// храповик, CLAUDE.md «Храповики»): request и verify — разный набор тестов,
// каждый со своим AppModule. Основной поток входа по ссылке — новый без
// кода, валидный код, повтор ссылки, существующий email. Ветка доступа
// (невалидный код, blocked, существующий с неверным кодом) —
// auth-email-verify-access.e2e-spec.ts (тот же setup через
// createEmailVerifyHelpers). MailService подменён фейком (fake-mail-service.ts).
import request from 'supertest';
import { NO_INVITE_LINK_MESSAGE, type ApiErrorBody, type MeDto } from '@xuanxue/shared';
import { MailService } from '../src/mail/mail.service';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import {
  createEmailVerifyHelpers,
  freshIp,
} from './e2e-support/auth-email-verify-fixtures';
import {
  createFakeMailService,
  tokenFromLink,
  type FakeMailService,
} from './e2e-support/fake-mail-service';

describe('POST /auth/email/verify (e2e), Resend подключён', () => {
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
    await helpers.postRequest('no-invite@example.com', freshIp());
    const token = tokenFromLink(helpers.lastSentLink());

    const res = await helpers.postVerify(token, freshIp());

    expect(res.status).toBe(403);
    expect((res.body as ApiErrorBody).message).toBe(NO_INVITE_LINK_MESSAGE);
    await expect(
      helpers.userModel().countDocuments({ email: 'no-invite@example.com' }),
    ).resolves.toBe(0);
  });

  it('новый email с валидным inviteCode — 200, active, joinedViaInvite, /auth/me подтверждает', async () => {
    const code = await helpers.currentInviteCode();
    await helpers.postRequest('verify-flow@example.com', freshIp());
    const token = tokenFromLink(helpers.lastSentLink());

    const res = await helpers.postVerify(token, freshIp(), code);

    expect(res.status).toBe(200);
    const body = res.body as MeDto;
    expect(body.status).toBe('active');
    expect(body.roles).toEqual([]);
    expect(body.telegramLinked).toBe(false); // инцидент 2026-09-16, RUNBOOK §8.17
    // Новый email — без telegramId, боту тем более некуда писать (ADR-0042).
    expect(body.botChatActive).toBe(false);
    // Только поля MeDto — email/tokenHash в ответе нет (SECURITY §2, CLAUDE.md «API»).
    expect(Object.keys(body).sort()).toEqual(
      ['botChatActive', 'id', 'name', 'roles', 'status', 'telegramLinked', 'tz'].sort(),
    );
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toContain('session=');

    const me = await request(helpers.server()).get('/api/auth/me').set('Cookie', cookie);
    expect(me.status).toBe(200);
    expect((me.body as MeDto).status).toBe('active');

    const created = await helpers
      .userModel()
      .findOne({ email: 'verify-flow@example.com' })
      .lean();
    expect(created?.joinedViaInviteAt).toBeInstanceOf(Date);
  });

  it('повторное использование той же ссылки — 401', async () => {
    const code = await helpers.currentInviteCode();
    await helpers.postRequest('once-only@example.com', freshIp());
    const token = tokenFromLink(helpers.lastSentLink());
    const first = await helpers.postVerify(token, freshIp(), code);
    expect(first.status).toBe(200);

    const second = await helpers.postVerify(token, freshIp(), code);
    expect(second.status).toBe(401);
  });

  it('существующий email — вход без создания второго пользователя', async () => {
    await helpers.userModel().create({
      name: 'Маша',
      email: 'masha@example.com',
      roles: [],
      status: 'active',
    });
    await helpers.postRequest('masha@example.com', freshIp());
    const token = tokenFromLink(helpers.lastSentLink());

    const res = await helpers.postVerify(token, freshIp());

    expect(res.status).toBe(200);
    expect((res.body as MeDto).status).toBe('active');
    await expect(
      helpers.userModel().countDocuments({ email: 'masha@example.com' }),
    ).resolves.toBe(1);
  });
});
