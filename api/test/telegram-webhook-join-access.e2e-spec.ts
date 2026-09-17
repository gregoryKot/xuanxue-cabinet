// e2e на вход через бота по ссылке-приглашению — доступ blocked/невалидный
// код/бутстрап-админ (ADR-0030 «Бот», ADR-0036) — вынесено из
// telegram-webhook-join.e2e-spec.ts (CLAUDE.md, файловый храповик: тот файл
// уже на пределе, дальше расти нельзя). Тот же фейковый Telegraf и
// AppModule, что и там, но своя beforeAll/afterAll — файлы независимы, без
// общего состояния между ними.
import { getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import request from 'supertest';
import type { InviteLinkDto, UserDto } from '@xuanxue/shared';
import {
  createFakeTelegrafFactory,
  type FakeTelegraf,
} from '../src/telegram/test-support/telegraf-factory';
import { TELEGRAF_FACTORY } from '../src/telegram/telegraf-instance';
import { TELEGRAM_WEBHOOK_PATH } from '../src/telegram/telegram-bot.service';
import { TELEGRAM_SECRET_HEADER } from '../src/telegram/telegram-webhook.guard';
import { UserRecord } from '../src/users/user.schema';
import {
  createTestApp,
  TEST_BOOTSTRAP_ADMIN_TELEGRAM_ID,
  TEST_TELEGRAM_WEBHOOK_SECRET,
  type TestApp,
} from './e2e-support/create-app';
import { sessionCookieFor, withCsrf } from './e2e-support/http';

describe('Telegram webhook (e2e) — вход по ссылке-приглашению через бота: доступ', () => {
  let testApp: TestApp;
  let fakeTelegraf: FakeTelegraf;

  beforeAll(async () => {
    fakeTelegraf = createFakeTelegrafFactory();
    testApp = await createTestApp((builder) => {
      builder.overrideProvider(TELEGRAF_FACTORY).useValue(fakeTelegraf.factory);
    });
  }, 60_000);

  afterAll(async () => {
    await testApp.close();
  });

  const server = (): ReturnType<TestApp['app']['getHttpServer']> =>
    testApp.app.getHttpServer();

  async function inviteCode(adminCookie: string): Promise<string> {
    const res = await withCsrf(request(server()).post('/api/users/invite-link')).set(
      'Cookie',
      adminCookie,
    );
    const code = (res.body as InviteLinkDto).url?.split('/join/')[1];
    if (!code) throw new Error('invite-link: код не создан');
    return code;
  }

  function sendStart(
    chatId: number,
    firstName: string,
    payload: string,
    updateId: number,
  ): request.Test {
    return request(server())
      .post(TELEGRAM_WEBHOOK_PATH)
      .set(TELEGRAM_SECRET_HEADER, TEST_TELEGRAM_WEBHOOK_SECRET)
      .send({
        update_id: updateId,
        message: {
          message_id: 1,
          date: 0,
          chat: { id: chatId, type: 'private', first_name: firstName },
          from: { id: chatId, is_bot: false, first_name: firstName },
          text: `/start ${payload}`,
          entities: [{ offset: 0, length: 6, type: 'bot_command' }],
        },
      });
  }

  // blocked получает тот же отказ, что и остальные пути бота (SECURITY §2) —
  // верный код ссылки его не проносит мимо статуса. Здесь проверяется база:
  // текст ответа (ACCESS_MESSAGE) — в start.handler.join.spec.ts с фейковым
  // ctx, потому что Telegraf на каждый апдейт создаёт свой экземпляр
  // Telegram, и перехватчик sendMessage фейковой фабрики (telegraf-factory.ts)
  // ответов через ctx.reply не видит.
  it('blocked-человек с верным кодом — статус не меняется, аккаунт не пересоздаётся', async () => {
    const adminCookie = await sessionCookieFor(testApp.app, ['admin']);
    const code = await inviteCode(adminCookie);
    const userModel: Model<UserRecord> = testApp.app.get(getModelToken(UserRecord.name), {
      strict: false,
    });
    await userModel.create({
      name: 'Заблокирован',
      telegramId: 900557,
      roles: [],
      status: 'blocked',
    });

    const res = await sendStart(900557, 'Заблокирован', `join_${code}`, 20);
    expect(res.status).toBe(200);

    const person = await userModel.findOne({ telegramId: 900557 }).lean();
    expect(person?.status).toBe('blocked');
    expect(person?.joinedViaInviteAt).toBeUndefined();
    expect(await userModel.countDocuments({ telegramId: 900557 })).toBe(1);
  });

  it('незнакомец + невалидный код — аккаунт не создаётся', async () => {
    const invalidCode = '0'.repeat(32);

    const res = await sendStart(900558, 'Чужой', `join_${invalidCode}`, 21);
    expect(res.status).toBe(200);

    const userModel: Model<UserRecord> = testApp.app.get(getModelToken(UserRecord.name), {
      strict: false,
    });
    expect(await userModel.countDocuments({ telegramId: 900558 })).toBe(0);
  });

  // Регрессия аудита 2026-09-16: до перехода бота на LoginIdentityService
  // бутстрап-админ, впервые открывший join_<code>, заводился учеником без
  // ролей — здесь тот же сервис, что у POST /auth/telegram, заводит его
  // сразу admin+teacher.
  it('бутстрап-админ впервые открывает join_<code> — active с ролями admin и teacher', async () => {
    const adminCookie = await sessionCookieFor(testApp.app, ['admin']);
    const code = await inviteCode(adminCookie);

    const res = await sendStart(
      TEST_BOOTSTRAP_ADMIN_TELEGRAM_ID,
      'Дима',
      `join_${code}`,
      22,
    );
    expect(res.status).toBe(200);

    const list = await request(server()).get('/api/users').set('Cookie', adminCookie);
    const person = (list.body as UserDto[]).find(
      (u) => u.hasTelegram && u.status === 'active' && u.roles.includes('admin'),
    );
    expect(person?.roles).toEqual(expect.arrayContaining(['admin', 'teacher']));
    expect(person?.status).toBe('active');
  });
});
