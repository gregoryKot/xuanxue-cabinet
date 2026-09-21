// e2e на привязку почты к уже вошедшему человеку (ADR-0059) — обратная
// сторона связки Telegram (ADR-0034, telegram-link.e2e-spec.ts): здесь
// ссылка уходит на почту, а не в Telegram, и подтверждение не выпускает
// сессию — это главное отличие от входа по email (ADR-0029/0044). Общий
// setup — email-link-fixtures.ts (createEmailLinkHelpers/createEmailLinkTestApp),
// файловый храповик развёл файлы (CLAUDE.md «Храповики»). Сценарий смены ещё
// не подтверждённого адреса (опечатка во второй ссылке) — в
// email-link-change.e2e-spec.ts, тот же setup через фикстуры.
import request from 'supertest';
import type { ApiErrorBody, MeDto } from '@xuanxue/shared';
import { EMAIL_LINK_TAKEN_MESSAGE, NO_INVITE_LINK_MESSAGE } from '@xuanxue/shared';
import { UserRecord } from '../src/users/user.schema';
import type { TestApp } from './e2e-support/create-app';
import {
  createEmailLinkHelpers,
  createEmailLinkTestApp,
  freshIp,
} from './e2e-support/email-link-fixtures';
import {
  createFakeMailService,
  type FakeMailService,
} from './e2e-support/fake-mail-service';
import { withCsrf } from './e2e-support/http';
import { createUserWithSession } from './e2e-support/session';

describe('Привязка почты к аккаунту (e2e)', () => {
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

  it('без сессии — 401', async () => {
    const res = await withCsrf(request(helpers.server()).post('/api/auth/email/link'))
      .set('x-forwarded-for', freshIp())
      .send({ email: 'a@example.com' });

    expect(res.status).toBe(401);
  });

  it('привязал адрес — pendingEmail и hasEmail: false сразу в ответе POST (read-after-write)', async () => {
    const { cookie } = await createUserWithSession(testApp.app, {
      name: 'Вошёл через Telegram',
      roles: [],
      telegramId: 700_001,
    });

    const linked = await helpers.postLink(cookie, 'student-1@example.com');
    expect(linked.status).toBe(200);
    const body = linked.body as MeDto;
    expect(body.hasEmail).toBe(false);
    expect(body.pendingEmail).toBe('student-1@example.com');

    const me = await helpers.getMe(cookie); // тело равно GET сразу после (ADR-0087)
    expect(linked.body).toEqual(me.body);
  });

  it('неподтверждённый адрес не пускает — вход по нему не открывает этот аккаунт', async () => {
    const { cookie, userId } = await createUserWithSession(testApp.app, {
      name: 'Ждёт подтверждения',
      roles: [],
      telegramId: 700_002,
    });
    await helpers.postLink(cookie, 'unverified@example.com');

    // Вход по неподтверждённому адресу без ссылки-приглашения — 403: адрес
    // не найден среди подтверждённых (LoginIdentityService.resolveEmailUser
    // ищет только по users.email), значит для входа это «новый человек».
    await helpers.postEmailRequest('unverified@example.com');
    const res = await helpers.postEmailVerify(helpers.lastLoginToken());

    expect(res.status).toBe(403);
    expect((res.body as ApiErrorBody).message).toBe(NO_INVITE_LINK_MESSAGE);
    await expect(
      helpers.userModel().countDocuments({ email: 'unverified@example.com' }),
    ).resolves.toBe(0);
    const untouched = await helpers
      .userModel()
      .findById(userId)
      .lean<UserRecord | null>();
    expect(untouched?.email).toBeUndefined();
    expect(untouched?.pendingEmail).toBe('unverified@example.com');
  });

  it('подтверждение переносит pendingEmail в email, и вход по почте открывает тот же аккаунт', async () => {
    const { cookie, userId } = await createUserWithSession(testApp.app, {
      name: 'Подтвердит адрес',
      roles: [],
      telegramId: 700_003,
    });
    await helpers.postLink(cookie, 'confirm-me@example.com');

    const confirmed = await helpers.postConfirm(helpers.lastConfirmToken());
    expect(confirmed.status).toBe(204);

    const me = await helpers.getMe(cookie);
    const meBody = me.body as MeDto;
    expect(meBody.hasEmail).toBe(true);
    expect(meBody.pendingEmail).toBeUndefined();

    // Read-after-write через отдельный путь входа — тот же аккаунт, не второй.
    await helpers.postEmailRequest('confirm-me@example.com');
    const verified = await helpers.postEmailVerify(helpers.lastLoginToken());

    expect(verified.status).toBe(200);
    expect((verified.body as MeDto).id).toBe(userId);
  });

  it('чужой/неизвестный токен подтверждения не привязывает адрес', async () => {
    const owner = await createUserWithSession(testApp.app, {
      name: 'Хозяин ссылки',
      roles: [],
      telegramId: 700_004,
    });
    await helpers.postLink(owner.cookie, 'owned-by-owner@example.com');

    const res = await helpers.postConfirm('f'.repeat(64));

    expect(res.status).toBe(401);
    const untouched = await helpers
      .userModel()
      .findById(owner.userId)
      .lean<UserRecord | null>();
    expect(untouched?.email).toBeUndefined();
    expect(untouched?.pendingEmail).toBe('owned-by-owner@example.com');
  });

  it('адрес уже принадлежит другому аккаунту — 409', async () => {
    await helpers.userModel().create({
      name: 'Уже занял',
      email: 'taken@example.com',
      roles: [],
      status: 'active',
    });
    const { cookie } = await createUserWithSession(testApp.app, {
      name: 'Хочет чужой адрес',
      roles: [],
      telegramId: 700_005,
    });

    const res = await helpers.postLink(cookie, 'taken@example.com');

    expect(res.status).toBe(409);
    expect((res.body as ApiErrorBody).message).toBe(EMAIL_LINK_TAKEN_MESSAGE);
  });

  it('подтверждение не выдаёт сессию — в ответе нет Set-Cookie', async () => {
    const { cookie } = await createUserWithSession(testApp.app, {
      name: 'Без сессии на этом устройстве',
      roles: [],
      telegramId: 700_006,
    });
    await helpers.postLink(cookie, 'no-session@example.com');

    const res = await helpers.postConfirm(helpers.lastConfirmToken());

    expect(res.status).toBe(204);
    expect(res.headers['set-cookie']).toBeUndefined();
  });
});
