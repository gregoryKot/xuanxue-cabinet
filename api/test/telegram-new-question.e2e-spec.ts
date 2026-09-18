// e2e на диалог «Новый вопрос» в боте (ТЗ 4б.3, docs/PLAN.md §12): весь путь
// идёт апдейтами через настоящий вебхук в настоящий AppModule, а результат
// читается тем же `GET /exam-items`, что открывает кабинет — read-after-write
// «бот записал, кабинет показывает» (CLAUDE.md «Тесты»). Спеки диалога
// (new-exam-item-flow.spec.ts) проверяют те же шаги на фейках: там не видно
// ни маршрутизации апдейта, ни шифрования черновика в Mongo, ни того, что
// вопрос действительно доехал до HTTP-ответа кабинета.
//
// Фейковый только Telegraf (сеть) — ответы бота ловит `sendMessageCalls`,
// переходы по кнопкам `editMessageCalls` (test-support/telegraf-factory.ts).
import { getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import request from 'supertest';
import type { ExamItemDto } from '@xuanxue/shared';
import { ChannelRecord } from '../src/channels/channel.schema';
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
  TEST_TELEGRAM_WEBHOOK_SECRET,
  type TestApp,
} from './e2e-support/create-app';
import { sessionCookieFor } from './e2e-support/http';

const TEACHER_CHAT = 770101;
const STUDENT_CHAT = 770102;
const PROMPT = 'Какая стойка в начале формы?';

describe('Telegram webhook (e2e) — «Новый вопрос» в боте (ТЗ 4б.3)', () => {
  let testApp: TestApp;
  let fake: FakeTelegraf;
  let updateId = 0;

  beforeAll(async () => {
    fake = createFakeTelegrafFactory();
    testApp = await createTestApp((builder) => {
      builder.overrideProvider(TELEGRAF_FACTORY).useValue(fake.factory);
    });
    await seedTeacher();
    await model<UserRecord>(UserRecord.name).create({
      name: 'Ученик',
      telegramId: STUDENT_CHAT,
      roles: [],
      status: 'active',
    });
  }, 60_000);

  afterAll(async () => {
    await testApp.close();
  });

  const server = (): ReturnType<TestApp['app']['getHttpServer']> =>
    testApp.app.getHttpServer();

  function model<T>(name: string): Model<T> {
    return testApp.app.get(getModelToken(name), { strict: false });
  }

  /** Штат с активным личным каналом — тот же гейт, что у /тема
   * (private-teacher-chat.ts): без канала бот на команду молчит. */
  async function seedTeacher(): Promise<void> {
    await model<UserRecord>(UserRecord.name).create({
      name: 'Дима',
      telegramId: TEACHER_CHAT,
      roles: ['teacher'],
      status: 'active',
    });
    await model<ChannelRecord>(ChannelRecord.name).create({
      type: 'telegram',
      title: 'Дима',
      config: '{}',
      target: String(TEACHER_CHAT),
      active: true,
    });
  }

  async function send(body: object): Promise<void> {
    const res = await request(server())
      .post(TELEGRAM_WEBHOOK_PATH)
      .set(TELEGRAM_SECRET_HEADER, TEST_TELEGRAM_WEBHOOK_SECRET)
      .send(body);
    // Вебхук отвечает 200 и на ошибку внутри (иначе Telegram ретраит и
    // плодит дубли) — проверяем каждый шаг, чтобы падение было видно здесь.
    expect(res.status).toBe(200);
  }

  /** Обычное текстовое сообщение. `/вопрос` — кириллица, её Telegraf ловит
   * `hears` по тексту, entity `bot_command` не нужна (register-handlers.ts). */
  function text(chatId: number, value: string): Promise<void> {
    updateId += 1;
    return send({
      update_id: updateId,
      message: {
        message_id: updateId,
        date: 0,
        chat: { id: chatId, type: 'private', first_name: 'Дима' },
        from: { id: chatId, is_bot: false, first_name: 'Дима' },
        text: value,
      },
    });
  }

  function press(chatId: number, data: string): Promise<void> {
    updateId += 1;
    return send({
      update_id: updateId,
      callback_query: {
        id: String(updateId),
        from: { id: chatId, is_bot: false, first_name: 'Дима' },
        chat_instance: '1',
        message: {
          message_id: 5,
          date: 0,
          chat: { id: chatId, type: 'private', first_name: 'Дима' },
        },
        data,
      },
    });
  }

  const lastReply = (chatId: number): string | undefined =>
    fake.sendMessageCalls.filter((c) => c.chatId === String(chatId)).at(-1)?.text;

  const lastScreen = (chatId: number): string | undefined =>
    fake.editMessageCalls.filter((c) => c.chatId === String(chatId)).at(-1)?.text;

  async function examItems(): Promise<ExamItemDto[]> {
    const cookie = await sessionCookieFor(testApp.app, ['teacher']);
    const res = await request(server()).get('/api/exam-items').set('Cookie', cookie);
    expect(res.status).toBe(200);
    return res.body as ExamItemDto[];
  }

  it('учитель проходит диалог до конца — вопрос виден в кабинете', async () => {
    await text(TEACHER_CHAT, '/вопрос');
    expect(lastReply(TEACHER_CHAT)).toContain('Выберите тип ответа');

    await press(TEACHER_CHAT, 'nqk:single');
    expect(lastScreen(TEACHER_CHAT)).toContain('формулировку вопроса');

    await text(TEACHER_CHAT, PROMPT);
    expect(lastReply(TEACHER_CHAT)).toContain('первый вариант ответа');

    await text(TEACHER_CHAT, 'Мабу');
    await text(TEACHER_CHAT, 'Гунбу');
    expect(lastReply(TEACHER_CHAT)).toContain('Добавлено вариантов: 2');

    await press(TEACHER_CHAT, 'nqd:options');
    expect(lastScreen(TEACHER_CHAT)).toContain('Какой вариант верный?');

    await press(TEACHER_CHAT, 'nqo:1');
    expect(lastScreen(TEACHER_CHAT)).toContain('критерии проверки');

    await press(TEACHER_CHAT, 'nqf:skip');
    expect(lastScreen(TEACHER_CHAT)).toContain('Всё верно?');

    await press(TEACHER_CHAT, 'nqf:save');
    expect(lastScreen(TEACHER_CHAT)).toContain('Вопрос сохранён');

    const item = (await examItems()).find((i) => i.prompt === PROMPT);
    expect(item?.kind).toBe('single');
    // Статуса «черновик» у вопроса из бота нет, как и у вопроса из кабинета
    // (ADR-0033): отдельным шагом публиковать нечего.
    expect(item?.status).toBe('published');
    expect(item?.options.map((o) => ({ text: o.text, correct: o.correct }))).toEqual([
      { text: 'Мабу', correct: false },
      { text: 'Гунбу', correct: true },
    ]);
  });

  it('повторное «Сохранить» — тот же вопрос, не второй', async () => {
    const before = (await examItems()).length;

    await press(TEACHER_CHAT, 'nqf:save');

    expect(lastScreen(TEACHER_CHAT)).toContain('уже сохранён');
    expect((await examItems()).length).toBe(before);
  });

  it('ученик — бот молчит, вопросов не прибавилось', async () => {
    const before = (await examItems()).length;

    await text(STUDENT_CHAT, '/вопрос');
    await press(STUDENT_CHAT, 'nqk:single');

    expect(lastReply(STUDENT_CHAT)).toBeUndefined();
    expect(lastScreen(STUDENT_CHAT)).toBeUndefined();
    expect((await examItems()).length).toBe(before);
  });
});
