// e2e на смену ещё не подтверждённого адреса привязки почты (ADR-0059) —
// отделён от email-link.e2e-spec.ts (файловый храповик, CLAUDE.md
// «Храповики»): основной поток привязки/подтверждения — там, здесь —
// отдельный сценарий «опечатался в адресе, отправил ссылку повторно», со
// своим AppModule. Общий setup — e2e-support/email-link-fixtures.ts
// (createEmailLinkHelpers/createEmailLinkTestApp), тот же, что использует
// email-link.e2e-spec.ts.
import type { MeDto } from '@xuanxue/shared';
import { UserRecord } from '../src/users/user.schema';
import type { TestApp } from './e2e-support/create-app';
import {
  createEmailLinkHelpers,
  createEmailLinkTestApp,
} from './e2e-support/email-link-fixtures';
import {
  createFakeMailService,
  type FakeMailService,
} from './e2e-support/fake-mail-service';
import { createUserWithSession } from './e2e-support/session';

describe('Смена ещё не подтверждённого адреса привязки (e2e)', () => {
  let testApp: TestApp;
  let fakeMail: FakeMailService;
  const helpers = createEmailLinkHelpers(
    () => testApp,
    () => fakeMail,
  );

  beforeAll(async () => {
    fakeMail = createFakeMailService();
    testApp = await createEmailLinkTestApp(fakeMail);
  }, 60_000);

  afterAll(async () => {
    await testApp.close();
  });

  it('опечатались в неподтверждённом адресе — второй link меняет pendingEmail, старая ссылка сгорает, новая подтверждает новый адрес', async () => {
    // Опечатка в ещё не подтверждённом адресе — письмо ушло бы в никуда.
    // link() отказывает только при подтверждённом user.email, поэтому второй
    // адрес принимается как обычная привязка (issue() удаляет прежние токены
    // человека) — старая ссылка обязана сгореть, чтобы её нельзя было
    // подтвердить после смены адреса.
    const { cookie } = await createUserWithSession(testApp.app, {
      name: 'Опечатался в адресе',
      roles: [],
      telegramId: 700_010,
    });

    const firstLinked = await helpers.postLink(cookie, 'typo-1@example.com');
    expect(firstLinked.status).toBe(204);
    const oldToken = helpers.lastConfirmToken();

    const secondLinked = await helpers.postLink(cookie, 'right-1@example.com');
    expect(secondLinked.status).toBe(204);

    const meAfterSecondLink = await helpers.getMe(cookie);
    const bodyAfterSecondLink = meAfterSecondLink.body as MeDto;
    expect(bodyAfterSecondLink.pendingEmail).toBe('right-1@example.com');
    expect(bodyAfterSecondLink.hasEmail).toBe(false);

    const oldConfirm = await helpers.postConfirm(oldToken);
    expect(oldConfirm.status).toBe(401);
    const meAfterOldConfirm = await helpers.getMe(cookie);
    expect((meAfterOldConfirm.body as MeDto).hasEmail).toBe(false);

    const newConfirm = await helpers.postConfirm(helpers.lastConfirmToken());
    expect(newConfirm.status).toBe(204);

    const meAfterNewConfirm = await helpers.getMe(cookie);
    const bodyAfterNewConfirm = meAfterNewConfirm.body as MeDto;
    expect(bodyAfterNewConfirm.hasEmail).toBe(true);
    expect(bodyAfterNewConfirm.pendingEmail).toBeUndefined();
    const stored = await helpers
      .userModel()
      .findById(bodyAfterNewConfirm.id)
      .lean<UserRecord | null>();
    expect(stored?.email).toBe('right-1@example.com');
  });
});
