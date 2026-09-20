// e2e на привязку почты к уже вошедшему человеку (ADR-0059) — обратная
// сторона связки Telegram (ADR-0034, telegram-link.e2e-spec.ts): здесь
// ссылка уходит на почту, а не в Telegram, и подтверждение не выпускает
// сессию — это главное отличие от входа по email (ADR-0029/0044). Resend
// подключён через envOverrides, MailService подменён фейком
// (fake-mail-service.ts) — сеть не трогаем (CLAUDE.md «Тесты»). Свой IP на
// каждый мутирующий запрос (RFC 5737 TEST-NET-3) — троттлер лимитирует
// /auth/email/link и /auth/email/confirm по IP (5/мин), общий IP по всем
// тестам файла столкнул бы бакеты (тот же приём, что у auth-email.e2e-spec.ts).
import { getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import request from 'supertest';
import type { ApiErrorBody, MeDto } from '@xuanxue/shared';
import { EMAIL_LINK_TAKEN_MESSAGE, NO_INVITE_LINK_MESSAGE } from '@xuanxue/shared';
import { MailService } from '../src/mail/mail.service';
import { UserRecord } from '../src/users/user.schema';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import {
  createFakeMailService,
  tokenFromLink,
  type FakeMailService,
} from './e2e-support/fake-mail-service';
import { withCsrf } from './e2e-support/http';
import { createUserWithSession } from './e2e-support/session';

let lastIpOctet = 0;
function freshIp(): string {
  lastIpOctet += 1;
  return `203.0.113.${lastIpOctet}`;
}

describe('Привязка почты к аккаунту (e2e)', () => {
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

  const server = (): ReturnType<TestApp['app']['getHttpServer']> =>
    testApp.app.getHttpServer();
  const userModel = (): Model<UserRecord> =>
    testApp.app.get(getModelToken(UserRecord.name), { strict: false });

  function postLink(cookie: string, email: string): request.Test {
    return withCsrf(request(server()).post('/api/auth/email/link'))
      .set('Cookie', cookie)
      .set('x-forwarded-for', freshIp())
      .send({ email });
  }

  function postConfirm(token: string): request.Test {
    return withCsrf(request(server()).post('/api/auth/email/confirm'))
      .set('x-forwarded-for', freshIp())
      .send({ token });
  }

  function postEmailRequest(email: string): request.Test {
    return withCsrf(request(server()).post('/api/auth/email/request'))
      .set('x-forwarded-for', freshIp())
      .send({ email });
  }

  function postEmailVerify(token: string): request.Test {
    return withCsrf(request(server()).post('/api/auth/email/verify'))
      .set('x-forwarded-for', freshIp())
      .send({ token });
  }

  function getMe(cookie: string): request.Test {
    return request(server()).get('/api/auth/me').set('Cookie', cookie);
  }

  function lastConfirmToken(): string {
    return tokenFromLink(
      fakeMail.sentConfirm[fakeMail.sentConfirm.length - 1]?.link ?? '',
    );
  }

  function lastLoginToken(): string {
    return tokenFromLink(fakeMail.sent[fakeMail.sent.length - 1]?.link ?? '');
  }

  it('без сессии — 401', async () => {
    const res = await withCsrf(request(server()).post('/api/auth/email/link'))
      .set('x-forwarded-for', freshIp())
      .send({ email: 'a@example.com' });

    expect(res.status).toBe(401);
  });

  it('привязал адрес — GET /auth/me показывает pendingEmail, hasEmail: false (read-after-write)', async () => {
    const { cookie } = await createUserWithSession(testApp.app, {
      name: 'Вошёл через Telegram',
      roles: [],
      telegramId: 700_001,
    });

    const linked = await postLink(cookie, 'student-1@example.com');
    expect(linked.status).toBe(204);

    const me = await getMe(cookie);
    const body = me.body as MeDto;
    expect(body.hasEmail).toBe(false);
    expect(body.pendingEmail).toBe('student-1@example.com');
  });

  it('неподтверждённый адрес не пускает — вход по нему не открывает этот аккаунт', async () => {
    const { cookie, userId } = await createUserWithSession(testApp.app, {
      name: 'Ждёт подтверждения',
      roles: [],
      telegramId: 700_002,
    });
    await postLink(cookie, 'unverified@example.com');

    // Вход по неподтверждённому адресу без ссылки-приглашения — 403: адрес
    // не найден среди подтверждённых (LoginIdentityService.resolveEmailUser
    // ищет только по users.email), значит для входа это «новый человек».
    await postEmailRequest('unverified@example.com');
    const res = await postEmailVerify(lastLoginToken());

    expect(res.status).toBe(403);
    expect((res.body as ApiErrorBody).message).toBe(NO_INVITE_LINK_MESSAGE);
    await expect(
      userModel().countDocuments({ email: 'unverified@example.com' }),
    ).resolves.toBe(0);
    const untouched = await userModel().findById(userId).lean<UserRecord | null>();
    expect(untouched?.email).toBeUndefined();
    expect(untouched?.pendingEmail).toBe('unverified@example.com');
  });

  it('подтверждение переносит pendingEmail в email, и вход по почте открывает тот же аккаунт', async () => {
    const { cookie, userId } = await createUserWithSession(testApp.app, {
      name: 'Подтвердит адрес',
      roles: [],
      telegramId: 700_003,
    });
    await postLink(cookie, 'confirm-me@example.com');

    const confirmed = await postConfirm(lastConfirmToken());
    expect(confirmed.status).toBe(204);

    const me = await getMe(cookie);
    const meBody = me.body as MeDto;
    expect(meBody.hasEmail).toBe(true);
    expect(meBody.pendingEmail).toBeUndefined();

    // Read-after-write через отдельный путь входа — тот же аккаунт, не второй.
    await postEmailRequest('confirm-me@example.com');
    const verified = await postEmailVerify(lastLoginToken());

    expect(verified.status).toBe(200);
    expect((verified.body as MeDto).id).toBe(userId);
  });

  it('чужой/неизвестный токен подтверждения не привязывает адрес', async () => {
    const owner = await createUserWithSession(testApp.app, {
      name: 'Хозяин ссылки',
      roles: [],
      telegramId: 700_004,
    });
    await postLink(owner.cookie, 'owned-by-owner@example.com');

    const res = await postConfirm('f'.repeat(64));

    expect(res.status).toBe(401);
    const untouched = await userModel().findById(owner.userId).lean<UserRecord | null>();
    expect(untouched?.email).toBeUndefined();
    expect(untouched?.pendingEmail).toBe('owned-by-owner@example.com');
  });

  it('адрес уже принадлежит другому аккаунту — 409', async () => {
    await userModel().create({
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

    const res = await postLink(cookie, 'taken@example.com');

    expect(res.status).toBe(409);
    expect((res.body as ApiErrorBody).message).toBe(EMAIL_LINK_TAKEN_MESSAGE);
  });

  it('подтверждение не выдаёт сессию — в ответе нет Set-Cookie', async () => {
    const { cookie } = await createUserWithSession(testApp.app, {
      name: 'Без сессии на этом устройстве',
      roles: [],
      telegramId: 700_006,
    });
    await postLink(cookie, 'no-session@example.com');

    const res = await postConfirm(lastConfirmToken());

    expect(res.status).toBe(204);
    expect(res.headers['set-cookie']).toBeUndefined();
  });
});
