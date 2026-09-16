// e2e на связку Telegram с уже существующим аккаунтом (ADR-0034): кабинет
// выпускает одноразовый код, бот по `/start link_<код>` ставит `telegramId`
// тому аккаунту, чей код. Проверяем то, что дешёвыми тестами не проверить —
// весь путь целиком: HTTP с настоящей сессией, вебхук с `secret_token` и
// read-after-write через `GET /auth/me` (CLAUDE.md «Read-after-write»).
// Фейковый Telegraf и своя beforeAll — как в telegram-webhook-join.e2e-spec.ts.
import { getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import request from 'supertest';
import type { MeDto, TelegramLinkCodeDto } from '@xuanxue/shared';
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
import { createUserWithSession } from './e2e-support/session';
import { withCsrf } from './e2e-support/http';

describe('Связка Telegram (e2e)', () => {
  let testApp: TestApp;
  let updateId = 0;

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

  /** Код из ссылки — наружу отдаётся только собранный адрес чата с ботом
   * (TelegramLinkCodeDto), сам код живёт внутри него. */
  async function issueCode(cookie: string): Promise<string> {
    const res = await withCsrf(
      request(server()).post('/api/auth/telegram/link-code'),
    ).set('Cookie', cookie);
    expect(res.status).toBe(200);
    const { telegramUrl } = res.body as TelegramLinkCodeDto;
    const code = telegramUrl.split('start=link_')[1];
    if (!code) throw new Error(`не разобрали код из ссылки: ${telegramUrl}`);
    return code;
  }

  /** `/start link_<код>` от конкретного Telegram-пользователя — тем же путём,
   * что и настоящий апдейт: вебхук с secret_token, фейковый Telegraf. */
  async function startWithCode(code: string, telegramId: number): Promise<void> {
    updateId += 1;
    const res = await request(server())
      .post(TELEGRAM_WEBHOOK_PATH)
      .set(TELEGRAM_SECRET_HEADER, TEST_TELEGRAM_WEBHOOK_SECRET)
      .send({
        update_id: updateId,
        message: {
          message_id: 1,
          date: 0,
          chat: { id: telegramId, type: 'private', first_name: 'Ученик' },
          from: { id: telegramId, is_bot: false, first_name: 'Ученик' },
          text: `/start link_${code}`,
          entities: [{ offset: 0, length: 6, type: 'bot_command' }],
        },
      });
    expect(res.status).toBe(200);
  }

  async function telegramLinked(cookie: string): Promise<boolean> {
    const res = await request(server()).get('/api/auth/me').set('Cookie', cookie);
    expect(res.status).toBe(200);
    return (res.body as MeDto).telegramLinked;
  }

  it('код из кабинета привязывает Telegram, и /auth/me сразу это показывает', async () => {
    const { cookie } = await createUserWithSession(testApp.app, {
      name: 'Вошла по почте',
      roles: [],
    });
    expect(await telegramLinked(cookie)).toBe(false);

    await startWithCode(await issueCode(cookie), 900_601);

    expect(await telegramLinked(cookie)).toBe(true);
  });

  // Владение (SECURITY §3): личность даёт код, а не отправитель апдейта —
  // чужой код привязывает Telegram к ЧУЖОМУ аккаунту, а не к тому, кто
  // случайно оказался рядом. Второй человек остаётся несвязанным.
  it('чужой код не привязывает Telegram к своему аккаунту', async () => {
    const owner = await createUserWithSession(testApp.app, {
      name: 'Хозяин кода',
      roles: [],
    });
    const other = await createUserWithSession(testApp.app, {
      name: 'Другой человек',
      roles: [],
    });
    const ownerCode = await issueCode(owner.cookie);
    await issueCode(other.cookie); // свой код второй выпустил, но им не воспользовался

    await startWithCode(ownerCode, 900_602);

    expect(await telegramLinked(owner.cookie)).toBe(true);
    expect(await telegramLinked(other.cookie)).toBe(false);
  });

  // Занятый telegramId — отказ, а не молчаливое слияние аккаунтов (ADR-0034):
  // иначе подсунутая ссылка связки уносила бы чужой аккаунт вместе с ролями.
  it('занятый telegramId не переезжает на другой аккаунт', async () => {
    const userModel: Model<UserRecord> = testApp.app.get(getModelToken(UserRecord.name), {
      strict: false,
    });
    const existing = await userModel.create({
      name: 'Вошёл через Telegram',
      telegramId: 900_603,
      roles: [],
      status: 'active',
    });
    const { cookie } = await createUserWithSession(testApp.app, {
      name: 'Хочет чужой Telegram',
      roles: [],
    });

    await startWithCode(await issueCode(cookie), 900_603);

    expect(await telegramLinked(cookie)).toBe(false);
    const untouched = await userModel.findById(existing._id).lean<UserRecord>();
    expect(untouched?.telegramId).toBe(900_603);
  });

  // Одноразовость (SECURITY §2, как у ссылки входа по почте): код потребляется
  // первым же /start, повтор той же ссылки другим человеком не даёт ничего.
  it('код срабатывает один раз', async () => {
    const { cookie } = await createUserWithSession(testApp.app, {
      name: 'Связался первым',
      roles: [],
    });
    const code = await issueCode(cookie);

    await startWithCode(code, 900_604);
    await startWithCode(code, 900_605);

    const userModel: Model<UserRecord> = testApp.app.get(getModelToken(UserRecord.name), {
      strict: false,
    });
    const second = await userModel.findOne({ telegramId: 900_605 }).lean<UserRecord>();
    expect(second).toBeNull();
    const first = await userModel.findOne({ telegramId: 900_604 }).lean<UserRecord>();
    expect(first?.name).toBe('Связался первым');
  });

  it('без сессии код не выпускается', async () => {
    const res = await withCsrf(request(server()).post('/api/auth/telegram/link-code'));
    expect(res.status).toBe(401);
  });
});
