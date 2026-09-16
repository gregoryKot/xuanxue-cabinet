// e2e на вход через бота по ссылке-приглашению (`/start join_<code>`,
// ADR-0030 «Бот») — вынесено из telegram-webhook.e2e-spec.ts (CLAUDE.md,
// файловый храповик: общий файл уже был выше 150 строк, дальше расти
// нельзя). Тот же фейковый Telegraf и AppModule, что и там, но своя
// beforeAll/afterAll — файлы независимы, без общего состояния между ними.
import { getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import request from 'supertest';
import type { InviteLinkDto, UserDto } from '@xuanxue/shared';
import { createFakeTelegrafFactory } from '../src/telegram/test-support/telegraf-factory';
import { TELEGRAF_FACTORY } from '../src/telegram/telegraf-instance';
import { TELEGRAM_WEBHOOK_PATH } from '../src/telegram/telegram-bot.service';
import { TELEGRAM_SECRET_HEADER } from '../src/telegram/telegram-webhook.guard';
import { UserRecord } from '../src/users/user.schema';
import {
  createTestApp,
  TEST_TELEGRAM_WEBHOOK_SECRET,
  type TestApp,
} from './e2e-support/create-app';
import { sessionCookieFor, withCsrf } from './e2e-support/http';

describe('Telegram webhook (e2e) — вход по ссылке-приглашению через бота', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    testApp = await createTestApp((builder) => {
      builder
        .overrideProvider(TELEGRAF_FACTORY)
        .useValue(createFakeTelegrafFactory().factory);
    });
  }, 60_000);

  afterAll(async () => {
    await testApp.close();
  });

  const server = (): ReturnType<TestApp['app']['getHttpServer']> =>
    testApp.app.getHttpServer();

  // Ссылка-приглашение через бота (ADR-0030 «Бот», ADR-0034) — тот же код,
  // что и на сайте, тем же HTTP-путём, что вебхук проверяет остальные
  // апдейты (secret_token, фейковый Telegraf). Read-after-write — admin
  // GET /users. Известный человек — код игнорируется, тот же успех
  // идемпотентно (статуса «ждёт подтверждения» больше нет, ADR-0034).
  it('/start join_<code>, известный active-человек — тот же успех, статус не меняется, код игнорируется', async () => {
    const adminCookie = await sessionCookieFor(testApp.app, ['admin']);
    const linkReq = withCsrf(request(server()).post('/api/users/invite-link'));
    const linkRes = await linkReq.set('Cookie', adminCookie);
    const code = (linkRes.body as InviteLinkDto).url?.split('/join/')[1];

    const userModel: Model<UserRecord> = testApp.app.get(getModelToken(UserRecord.name), {
      strict: false,
    });
    const created = await userModel.create({
      name: 'Уже в кабинете',
      telegramId: 900555,
      roles: [],
      status: 'active',
    });

    const res = await request(server())
      .post(TELEGRAM_WEBHOOK_PATH)
      .set(TELEGRAM_SECRET_HEADER, TEST_TELEGRAM_WEBHOOK_SECRET)
      .send({
        update_id: 10,
        message: {
          message_id: 1,
          date: 0,
          chat: { id: 900555, type: 'private', first_name: 'Ученик' },
          from: { id: 900555, is_bot: false, first_name: 'Ученик' },
          text: `/start join_${code}`,
          entities: [{ offset: 0, length: 6, type: 'bot_command' }],
        },
      });
    expect(res.status).toBe(200);

    const list = await request(server()).get('/api/users').set('Cookie', adminCookie);
    const person = (list.body as UserDto[]).find((u) => u.id === created._id.toString());
    expect(person?.status).toBe('active');
    expect(person?.joinedViaInvite).toBe(false);
  });

  // Владелец, уточнение 2026-09-15: смысл ссылки — новый ученик из канала
  // сразу в школе, а не второй отказ бота. Незнакомый telegramId с верным
  // кодом заводит пользователя из Telegram-идентичности апдейта (first_name)
  // и сразу active — тем же путём, что и известный человек выше.
  it('/start join_<code> с верным кодом и незнакомым Telegram ID — заводит active-пользователя', async () => {
    const adminCookie = await sessionCookieFor(testApp.app, ['admin']);
    const linkReq = withCsrf(request(server()).post('/api/users/invite-link'));
    const linkRes = await linkReq.set('Cookie', adminCookie);
    const code = (linkRes.body as InviteLinkDto).url?.split('/join/')[1];

    const res = await request(server())
      .post(TELEGRAM_WEBHOOK_PATH)
      .set(TELEGRAM_SECRET_HEADER, TEST_TELEGRAM_WEBHOOK_SECRET)
      .send({
        update_id: 11,
        message: {
          message_id: 1,
          date: 0,
          chat: { id: 900556, type: 'private', first_name: 'Пришёл по ссылке' },
          from: { id: 900556, is_bot: false, first_name: 'Пришёл по ссылке' },
          text: `/start join_${code}`,
          entities: [{ offset: 0, length: 6, type: 'bot_command' }],
        },
      });
    expect(res.status).toBe(200);

    const list = await request(server()).get('/api/users').set('Cookie', adminCookie);
    const person = (list.body as UserDto[]).find((u) => u.name === 'Пришёл по ссылке');
    expect(person?.status).toBe('active');
    expect(person?.hasTelegram).toBe(true);
    expect(person?.joinedViaInvite).toBe(true);
  });
});
