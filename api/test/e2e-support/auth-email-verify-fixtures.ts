// Общие HTTP-хелперы e2e POST /auth/email/verify — делят
// auth-email-verify.e2e-spec.ts (основной поток) и
// auth-email-verify-access.e2e-spec.ts (ветка доступа): файловый храповик
// развёл их по разным файлам (CLAUDE.md «Храповики»), по образцу
// users-fixtures.ts. `freshIp` — не своя копия, а переэкспорт из
// telegram-widget-fixtures.ts: один счётчик октетов на всю e2e-инфраструктуру
// вместо копии в каждом файле.
import { getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import request from 'supertest';
import type { InviteLinkDto } from '@xuanxue/shared';
import { UserRecord } from '../../src/users/user.schema';
import { sessionCookieFor, withCsrf } from './http';
import type { TestApp } from './create-app';
import type { FakeMailService } from './fake-mail-service';

export { freshIp } from './telegram-widget-fixtures';

/** `getApp`/`getFakeMail` — геттеры, не значения: как в users-fixtures.ts —
 * вызываются лениво из `it()`, когда `beforeAll` уже присвоил testApp/fakeMail. */
export function createEmailVerifyHelpers(
  getApp: () => TestApp,
  getFakeMail: () => FakeMailService,
) {
  const server = (): ReturnType<TestApp['app']['getHttpServer']> =>
    getApp().app.getHttpServer();
  const userModel = (): Model<UserRecord> =>
    getApp().app.get(getModelToken(UserRecord.name), { strict: false });

  function postRequest(email: string, ip: string): request.Test {
    return request(server())
      .post('/api/auth/email/request')
      .set('x-requested-with', 'fetch')
      .set('x-forwarded-for', ip)
      .send({ email });
  }

  function postVerify(token: string, ip: string, inviteCode?: string): request.Test {
    return request(server())
      .post('/api/auth/email/verify')
      .set('x-requested-with', 'fetch')
      .set('x-forwarded-for', ip)
      .send(inviteCode ? { token, inviteCode } : { token });
  }

  // Код из письма (ADR-0104) — второй способ потратить ту же заявку, рядом с
  // postVerify() тем же приёмом.
  function postCode(
    email: string,
    code: string,
    ip: string,
    inviteCode?: string,
  ): request.Test {
    return request(server())
      .post('/api/auth/email/code')
      .set('x-requested-with', 'fetch')
      .set('x-forwarded-for', ip)
      .send(inviteCode ? { email, code, inviteCode } : { email, code });
  }

  function lastSentLink(): string {
    const sent = getFakeMail().sent;
    return sent[sent.length - 1]?.link ?? '';
  }

  function lastSentCode(): string {
    const sent = getFakeMail().sent;
    return sent[sent.length - 1]?.code ?? '';
  }

  async function currentInviteCode(): Promise<string> {
    const adminCookie = await sessionCookieFor(getApp().app, ['admin']);
    const res = await withCsrf(request(server()).post('/api/users/invite-link')).set(
      'Cookie',
      adminCookie,
    );
    const url = (res.body as InviteLinkDto).url as string;
    return url.split('/join/')[1] as string;
  }

  return {
    server,
    userModel,
    postRequest,
    postVerify,
    postCode,
    lastSentLink,
    lastSentCode,
    currentInviteCode,
  };
}
