// e2e POST /auth/email/verify — ветка доступа (ADR-0030/0036): нового
// человека без валидной ссылки-приглашения не заводим, blocked получает 403
// тем же ACCESS_MESSAGE независимо от кода, у существующего человека код
// (даже неверный) не мешает входу. Отделён от auth-email-verify.e2e-spec.ts
// (файловый храповик, CLAUDE.md «Храповики») — свой AppModule, общий setup
// через createEmailVerifyHelpers (e2e-support/auth-email-verify-fixtures.ts).
// MailService подменён фейком (fake-mail-service.ts).
import {
  ACCESS_MESSAGE,
  NO_INVITE_LINK_MESSAGE,
  type ApiErrorBody,
} from '@xuanxue/shared';
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

describe('POST /auth/email/verify (e2e) — ветка доступа', () => {
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

  it('новый email с невалидным inviteCode — 403, аккаунт не создаётся', async () => {
    await helpers.postRequest('invalid-invite@example.com', freshIp());
    const token = tokenFromLink(helpers.lastSentLink());

    const res = await helpers.postVerify(token, freshIp(), '0'.repeat(32));

    expect(res.status).toBe(403);
    expect((res.body as ApiErrorBody).message).toBe(NO_INVITE_LINK_MESSAGE);
    await expect(
      helpers.userModel().countDocuments({ email: 'invalid-invite@example.com' }),
    ).resolves.toBe(0);
  });

  // Два разных email, не один: `issue()` (email-login-token.service.ts)
  // молчит EMAIL_LOGIN_RESEND_COOLDOWN_MIN на повторный запрос тому же
  // адресу — второй `postRequest` того же email в этом же прогоне не прислал
  // бы новую (ещё не потреблённую) ссылку.
  it('blocked — 403 и с валидным кодом, и без, статус в базе не меняется', async () => {
    await helpers.userModel().create({
      name: 'Заблокирована',
      email: 'blocked-with-code@example.com',
      roles: [],
      status: 'blocked',
    });
    await helpers.userModel().create({
      name: 'Заблокирован',
      email: 'blocked-no-code@example.com',
      roles: [],
      status: 'blocked',
    });
    const code = await helpers.currentInviteCode();

    await helpers.postRequest('blocked-with-code@example.com', freshIp());
    const tokenWithCode = tokenFromLink(helpers.lastSentLink());
    const withCode = await helpers.postVerify(tokenWithCode, freshIp(), code);
    expect(withCode.status).toBe(403);
    expect((withCode.body as ApiErrorBody).message).toBe(ACCESS_MESSAGE);

    await helpers.postRequest('blocked-no-code@example.com', freshIp());
    const tokenNoCode = tokenFromLink(helpers.lastSentLink());
    const withoutCode = await helpers.postVerify(tokenNoCode, freshIp());
    expect(withoutCode.status).toBe(403);
    expect((withoutCode.body as ApiErrorBody).message).toBe(ACCESS_MESSAGE);

    const stillBlockedWithCode = await helpers
      .userModel()
      .findOne({ email: 'blocked-with-code@example.com' })
      .lean();
    expect(stillBlockedWithCode?.status).toBe('blocked');
    const stillBlockedNoCode = await helpers
      .userModel()
      .findOne({ email: 'blocked-no-code@example.com' })
      .lean();
    expect(stillBlockedNoCode?.status).toBe('blocked');
  });

  it('существующий email с неверным inviteCode — 200, код игнорируется', async () => {
    await helpers.userModel().create({
      name: 'Уже свой',
      email: 'existing-invalid-code@example.com',
      roles: [],
      status: 'active',
    });
    await helpers.postRequest('existing-invalid-code@example.com', freshIp());
    const token = tokenFromLink(helpers.lastSentLink());

    const res = await helpers.postVerify(token, freshIp(), '0'.repeat(32));

    expect(res.status).toBe(200);
    await expect(
      helpers.userModel().countDocuments({ email: 'existing-invalid-code@example.com' }),
    ).resolves.toBe(1);
  });
});
