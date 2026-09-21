// Общий setup e2e на привязку почты к уже вошедшему человеку (ADR-0059) —
// делят email-link.e2e-spec.ts (основной поток) и
// email-link-change.e2e-spec.ts (смена ещё не подтверждённого адреса):
// файловый храповик развёл их по разным файлам (CLAUDE.md «Храповики»), по
// образцу auth-email-verify-fixtures.ts. `freshIp` — не своя копия, а
// переэкспорт из telegram-widget-fixtures.ts (SECURITY §2, троттлер
// лимитирует /auth/email/link и /auth/email/confirm по IP — свой IP на
// каждый мутирующий запрос, иначе общий IP столкнул бы бакеты).
import { getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import request from 'supertest';
import { MailService } from '../../src/mail/mail.service';
import { UserRecord } from '../../src/users/user.schema';
import { createTestApp, type TestApp } from './create-app';
import { tokenFromLink, type FakeMailService } from './fake-mail-service';
import { freshIp } from './telegram-widget-fixtures';
import { withCsrf } from './http';

export { freshIp } from './telegram-widget-fixtures';

/** Resend подключён через envOverrides, MailService подменён фейком
 * (fake-mail-service.ts) — сеть не трогаем (CLAUDE.md «Тесты»). */
export function createEmailLinkTestApp(fakeMail: FakeMailService): Promise<TestApp> {
  return createTestApp(
    (builder) => {
      builder.overrideProvider(MailService).useValue(fakeMail.service);
    },
    {
      RESEND_API_KEY: 're_test_key',
      MAIL_FROM: 'Школа «Сюань-Сюэ» <school@xuanxue.su>',
    },
  );
}

/** `getApp`/`getFakeMail` — геттеры, не значения: как в
 * auth-email-verify-fixtures.ts — вызываются лениво из `it()`, когда
 * `beforeAll` уже присвоил testApp/fakeMail. */
export function createEmailLinkHelpers(
  getApp: () => TestApp,
  getFakeMail: () => FakeMailService,
) {
  const server = (): ReturnType<TestApp['app']['getHttpServer']> =>
    getApp().app.getHttpServer();
  const userModel = (): Model<UserRecord> =>
    getApp().app.get(getModelToken(UserRecord.name), { strict: false });

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
    const sent = getFakeMail().sentConfirm;
    return tokenFromLink(sent[sent.length - 1]?.link ?? '');
  }

  function lastLoginToken(): string {
    const sent = getFakeMail().sent;
    return tokenFromLink(sent[sent.length - 1]?.link ?? '');
  }

  return {
    server,
    userModel,
    postLink,
    postConfirm,
    postEmailRequest,
    postEmailVerify,
    getMe,
    lastConfirmToken,
    lastLoginToken,
  };
}
