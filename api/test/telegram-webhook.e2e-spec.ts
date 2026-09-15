// e2e на POST /api/telegram/webhook — secret_token (SECURITY §2, ADR-0015).
// Настоящий AppModule на MongoMemoryServer, TELEGRAF_FACTORY подменена
// фейком без сети (test-support/telegraf-factory.ts: реальная маршрутизация
// Composer, getMe()/setWebhook() перехвачены) — тот же приём, что у
// TELEGRAM_CLIENT_FACTORY в channels.e2e-spec.ts.
import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Model } from 'mongoose';
import { Logger } from 'nestjs-pino';
import request from 'supertest';
import type { InviteLinkDto, UserDto } from '@xuanxue/shared';
import { ChannelRecord } from '../src/channels/channel.schema';
import { DomainExceptionFilter } from '../src/common/domain-exception.filter';
import { createFakeTelegrafFactory } from '../src/telegram/test-support/telegraf-factory';
import { TELEGRAF_FACTORY } from '../src/telegram/telegraf-instance';
import {
  TelegramBotService,
  TELEGRAM_WEBHOOK_PATH,
} from '../src/telegram/telegram-bot.service';
import { TelegramController } from '../src/telegram/telegram.controller';
import {
  TELEGRAM_SECRET_HEADER,
  TelegramWebhookGuard,
} from '../src/telegram/telegram-webhook.guard';
import { UserRecord } from '../src/users/user.schema';
import {
  createTestApp,
  TEST_TELEGRAM_WEBHOOK_SECRET,
  type TestApp,
} from './e2e-support/create-app';
import { sessionCookieFor, withCsrf } from './e2e-support/http';

// my_chat_member: бот добавлен в группу (формат — из документации Telegram).
const CHAT_MEMBER_UPDATE = {
  update_id: 1,
  my_chat_member: {
    chat: { id: -100777, type: 'group', title: 'Ученики e2e' },
    from: { id: 10, is_bot: false, first_name: 'Дима' },
    date: 0,
    old_chat_member: {
      user: { id: 1, is_bot: true, first_name: 'Xuanxue Bot' },
      status: 'left',
    },
    new_chat_member: {
      user: { id: 1, is_bot: true, first_name: 'Xuanxue Bot' },
      status: 'member',
    },
  },
};

describe('Telegram webhook (e2e)', () => {
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

  it('без заголовка secret_token — 403', async () => {
    const res = await request(server())
      .post(TELEGRAM_WEBHOOK_PATH)
      .send(CHAT_MEMBER_UPDATE);
    expect(res.status).toBe(403);
  });

  it('с неверным secret_token — 403', async () => {
    const res = await request(server())
      .post(TELEGRAM_WEBHOOK_PATH)
      .set(TELEGRAM_SECRET_HEADER, 'wrong-secret-token')
      .send(CHAT_MEMBER_UPDATE);
    expect(res.status).toBe(403);
  });

  // Ни один из тестов файла не ставит x-requested-with — вебхук без него
  // проходит только благодаря @SkipCsrf() (SECURITY §2): без декоратора этот
  // тест падал бы 403 раньше проверки secret_token (порядок в AuthGuard).
  it('с верным secret_token и валидным апдейтом — 200, канал создан и подключён', async () => {
    const res = await request(server())
      .post(TELEGRAM_WEBHOOK_PATH)
      .set(TELEGRAM_SECRET_HEADER, TEST_TELEGRAM_WEBHOOK_SECRET)
      .send(CHAT_MEMBER_UPDATE);

    expect(res.status).toBe(200);

    const channelModel: Model<ChannelRecord> = testApp.app.get(
      getModelToken(ChannelRecord.name),
      { strict: false },
    );
    const channel = await channelModel.findOne({ target: '-100777' }).lean();
    expect(channel?.active).toBe(true);
    expect(channel?.type).toBe('telegram');
  });

  // Ссылка-приглашение через бота (ADR-0030 «Бот») — тот же код, что и на
  // сайте, тем же HTTP-путём, что вебхук проверяет остальные апдейты
  // (secret_token, фейковый Telegraf). Read-after-write — admin GET /users.
  it('/start join_<code> с верным кодом — invited становится active', async () => {
    const adminCookie = await sessionCookieFor(testApp.app, ['admin']);
    const linkReq = withCsrf(request(server()).post('/api/users/invite-link'));
    const linkRes = await linkReq.set('Cookie', adminCookie);
    const code = (linkRes.body as InviteLinkDto).url?.split('/join/')[1];

    const userModel: Model<UserRecord> = testApp.app.get(getModelToken(UserRecord.name), {
      strict: false,
    });
    const created = await userModel.create({
      name: 'Пришёл по ссылке из бота',
      telegramId: 900555,
      roles: [],
      status: 'invited',
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
    expect(person?.joinedViaInvite).toBe(true);
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

  it.each([
    ['пустое тело', {}],
    ['только update_id', { update_id: 1 }],
    ['message без полей', { update_id: 1, message: {} }],
  ])('минимальное/битое тело (%s) с верным секретом — тоже 200', async (_label, body) => {
    const res = await request(server())
      .post(TELEGRAM_WEBHOOK_PATH)
      .set(TELEGRAM_SECRET_HEADER, TEST_TELEGRAM_WEBHOOK_SECRET)
      .send(body);

    expect(res.status).toBe(200);
  });
});

// Без MongoMemoryServer/AppModule — намеренно: второй mongod в одном
// jest-процессе оказался нестабилен в этой песочнице (MongoMemoryServer
// иногда отдаёт URI не того порта, на котором реально поднялся mongod —
// внешняя нестабильность окружения, не баг PR). Guard бросает 503 ДО любого
// обращения к БД, поэтому Mongo для этого сценария не нужна вовсе — тот же
// стек HTTP (контроллер, гвард, DomainExceptionFilter), что и выше, но
// TELEGRAM_WEBHOOK_SECRET/BOT_TOKEN не заданы. Сам разбор ветвлений гварда —
// в telegram-webhook.guard.spec.ts (юнит, без HTTP).
describe('Telegram webhook (e2e) — TELEGRAM_WEBHOOK_SECRET/BOT_TOKEN не заданы', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [TelegramController],
      providers: [
        TelegramWebhookGuard,
        DomainExceptionFilter,
        { provide: ConfigService, useValue: { get: () => undefined } },
        {
          provide: TelegramBotService,
          useValue: { handleUpdate: () => Promise.resolve() },
        },
        { provide: Logger, useValue: { error: () => undefined } },
      ],
    }).compile();

    app = moduleRef.createNestApplication<NestExpressApplication>();
    app.setGlobalPrefix('api');
    app.useGlobalFilters(app.get(DomainExceptionFilter));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('секрет и токен не заданы в env — 503', async () => {
    const res = await request(app.getHttpServer())
      .post(TELEGRAM_WEBHOOK_PATH)
      .set(TELEGRAM_SECRET_HEADER, TEST_TELEGRAM_WEBHOOK_SECRET)
      .send(CHAT_MEMBER_UPDATE);

    expect(res.status).toBe(503);
  });
});
