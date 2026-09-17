// e2e POST /auth/telegram — существующий человек (ADR-0030/0036): вход как
// обычно, `inviteCode` не читается вовсе — ни отсутствие, ни (важно) неверный
// код не мешают входу и не создают второго пользователя. Отделён от
// auth-telegram-invite.e2e-spec.ts (файловый храповик, CLAUDE.md
// «Храповики») — свой AppModule, общий setup через
// createTelegramInviteHelpers (e2e-support/auth-telegram-invite-fixtures.ts).
import type { MeDto } from '@xuanxue/shared';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { createTelegramInviteHelpers } from './e2e-support/auth-telegram-invite-fixtures';
import { freshIp, telegramLoginBody } from './e2e-support/telegram-widget-fixtures';

describe('POST /auth/telegram (e2e) — ссылка-приглашение, существующий человек', () => {
  let testApp: TestApp;
  const helpers = createTelegramInviteHelpers(() => testApp);

  beforeAll(async () => {
    testApp = await createTestApp();
  }, 60_000);

  afterAll(async () => {
    await testApp.close();
  });

  it('существующий человек без кода — 200 как обычно, код игнорируется даже неверный', async () => {
    const ip = freshIp();
    const code = await helpers.currentInviteCode();
    const first = await helpers.post(
      telegramLoginBody({ id: 700_004, first_name: 'Ольга' }),
      ip,
      code,
    );
    expect(first.status).toBe(200);

    const second = await helpers.post(telegramLoginBody({ id: 700_004 }), ip);
    expect(second.status).toBe(200);
    expect((second.body as MeDto).id).toBe((first.body as MeDto).id);

    const third = await helpers.post(
      telegramLoginBody({ id: 700_004 }),
      ip,
      '0'.repeat(32),
    );
    expect(third.status).toBe(200);
    expect((third.body as MeDto).id).toBe((first.body as MeDto).id);

    expect(await helpers.userModel().countDocuments({ telegramId: 700_004 })).toBe(1);
  });
});
