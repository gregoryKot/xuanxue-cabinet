// Общие HTTP-хелперы ветки ссылки-приглашения Telegram-входа — делят
// auth-telegram-invite.e2e-spec.ts (новый человек) и
// auth-telegram-invite-existing.e2e-spec.ts (существующий человек):
// файловый храповик развёл их по разным файлам (CLAUDE.md «Храповики»), по
// образцу users-fixtures.ts.
import { getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import request from 'supertest';
import type { InviteLinkDto } from '@xuanxue/shared';
import { UserRecord } from '../../src/users/user.schema';
import { sessionCookieFor, withCsrf } from './http';
import type { TestApp } from './create-app';

/** `getApp` — геттер, не значение: как в users-fixtures.ts — вызывается
 * лениво из `it()`, когда `beforeAll` уже присвоил testApp. */
export function createTelegramInviteHelpers(getApp: () => TestApp) {
  const server = (): ReturnType<TestApp['app']['getHttpServer']> =>
    getApp().app.getHttpServer();
  const userModel = (): Model<UserRecord> =>
    getApp().app.get(getModelToken(UserRecord.name), { strict: false });

  /** Код — в query `?join=`, не в теле: подпись Telegram считается по телу
   * запроса целиком (telegram-login.ts), лишнее поле там сломало бы её. */
  function post(
    body: Record<string, unknown>,
    ip: string,
    inviteCode?: string,
  ): request.Test {
    const query = inviteCode ? `?join=${inviteCode}` : '';
    return request(server())
      .post(`/api/auth/telegram${query}`)
      .set('x-requested-with', 'fetch')
      .set('x-forwarded-for', ip)
      .send(body);
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

  return { server, userModel, post, currentInviteCode };
}
