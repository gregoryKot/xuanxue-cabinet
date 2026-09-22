// e2e на баг с #131 (найден 2026-09-16 на аудите): вход по
// ссылке-приглашению через бота (`/start join_<код>`, ADR-0030) заводил
// человека в active, но НЕ регистрировал личный чат — PersonalChats.chatFor()
// отдавал null, и результат экзамена/уведомления бота не доходили до
// второго /start. telegram-webhook-join.e2e-spec.ts уже проверяет переход
// статуса через users — здесь read-after-write по channels и по сообщениям
// бота. Отдельный файл — тот файл уже выше файлового храповика (CLAUDE.md),
// а не потому что тема другая.
import { getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import request from 'supertest';
import type { ChannelDto, InviteLinkDto } from '@xuanxue/shared';
import { ChannelRecord } from '../src/channels/channel.schema';
import {
  createFakeTelegrafFactory,
  type FakeTelegraf,
} from '../src/telegram/test-support/telegraf-factory';
import { TELEGRAF_FACTORY } from '../src/telegram/telegraf-instance';
import { TELEGRAM_WEBHOOK_PATH } from '../src/telegram/telegram-bot.service';
import { TELEGRAM_SECRET_HEADER } from '../src/telegram/telegram-webhook.guard';
import {
  createTestApp,
  TEST_TELEGRAM_WEBHOOK_SECRET,
  type TestApp,
} from './e2e-support/create-app';
import { sessionCookieFor, withCsrf } from './e2e-support/http';

describe('Telegram webhook (e2e) — личный чат по ссылке-приглашению (регрессия 2026-09-16)', () => {
  let testApp: TestApp;
  let fake: FakeTelegraf;

  beforeAll(async () => {
    // Ответы бота (ctx.reply) фейк ловит в sendMessageCalls — см. патч
    // прототипа в telegraf-factory.ts, без него они ушли бы в сеть.
    fake = createFakeTelegrafFactory();
    testApp = await createTestApp((builder) => {
      builder.overrideProvider(TELEGRAF_FACTORY).useValue(fake.factory);
    });
  }, 60_000);

  afterAll(async () => {
    await testApp.close();
  });

  const server = (): ReturnType<TestApp['app']['getHttpServer']> =>
    testApp.app.getHttpServer();

  async function inviteCode(adminCookie: string): Promise<string> {
    const linkReq = withCsrf(request(server()).post('/api/users/invite-link'));
    const linkRes = await linkReq.set('Cookie', adminCookie);
    return (linkRes.body as InviteLinkDto).url?.split('/join/')[1] ?? '';
  }

  it('незнакомец по ссылке — личный канал регистрируется, не виден на «Каналах», бот шлёт успех и меню', async () => {
    const adminCookie = await sessionCookieFor(testApp.app, ['admin']);
    const code = await inviteCode(adminCookie);

    const res = await request(server())
      .post(TELEGRAM_WEBHOOK_PATH)
      .set(TELEGRAM_SECRET_HEADER, TEST_TELEGRAM_WEBHOOK_SECRET)
      .send({
        update_id: 20,
        message: {
          message_id: 1,
          date: 0,
          chat: { id: 900557, type: 'private', first_name: 'Ученик' },
          from: { id: 900557, is_bot: false, first_name: 'Ученик' },
          text: `/start join_${code}`,
          entities: [{ offset: 0, length: 6, type: 'bot_command' }],
        },
      });
    expect(res.status).toBe(200);

    const channelModel: Model<ChannelRecord> = testApp.app.get(
      getModelToken(ChannelRecord.name),
      { strict: false },
    );
    const channel = await channelModel
      .findOne({ type: 'telegram', target: '900557' })
      .lean();
    expect(channel?.active).toBe(true);
    expect(channel?.broadcastEligible).toBe(false);

    // ADR-0027: личный чат ученика — не канал школы, учителю его не видно.
    const list = await request(server()).get('/api/channels').set('Cookie', adminCookie);
    expect((list.body as ChannelDto[]).some((c) => c.target === '900557')).toBe(false);

    // Одно сообщение, не два подряд: ссылка на кабинет стала вступлением к
    // тому же приветствию с кнопками (правка текстового шума 2026-09-22 —
    // несколько реплик об одном событии в чате читаются хуже, чем на
    // экране). Проверяем, что в нём осталось и то, и другое.
    const toStudent = fake.sendMessageCalls.filter((c) => c.chatId === '900557');
    expect(toStudent).toHaveLength(1);
    expect(toStudent[0]?.text).toMatch(/^Вы в кабинете школы Сюань-Сюэ/);
    expect(toStudent[0]?.text).toContain('Экзамены можно сдать');
    expect(toStudent[0]?.replyMarkup).toBeDefined();
  });

  it('неверный код — канал не создан, в чат ушло ровно одно сообщение (отказ)', async () => {
    const res = await request(server())
      .post(TELEGRAM_WEBHOOK_PATH)
      .set(TELEGRAM_SECRET_HEADER, TEST_TELEGRAM_WEBHOOK_SECRET)
      .send({
        update_id: 21,
        message: {
          message_id: 1,
          date: 0,
          chat: { id: 900558, type: 'private', first_name: 'Ученик' },
          from: { id: 900558, is_bot: false, first_name: 'Ученик' },
          text: `/start join_${'0'.repeat(32)}`,
          entities: [{ offset: 0, length: 6, type: 'bot_command' }],
        },
      });
    expect(res.status).toBe(200);

    const channelModel: Model<ChannelRecord> = testApp.app.get(
      getModelToken(ChannelRecord.name),
      { strict: false },
    );
    expect(await channelModel.countDocuments({ target: '900558' })).toBe(0);
    expect(fake.sendMessageCalls.filter((c) => c.chatId === '900558')).toHaveLength(1);
  });
});
