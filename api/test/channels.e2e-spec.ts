// e2e на /channels — данные школы (ADR-0010): доступ по роли, не по владельцу
// (e2e-support/README.md, «данные школы»). Настоящий AppModule на
// MongoMemoryServer, `TelegramClientFactory` подменена фейком через
// `overrides` — сеть не трогаем, сам механизм подмены смотри в create-app.ts.
import { Types } from 'mongoose';
import request from 'supertest';
import type { ApiErrorBody, ChannelDto } from '@xuanxue/shared';
import { TELEGRAM_CLIENT_FACTORY } from '../src/channels/telegram-client';
import { createTestApp, TEST_BOT_TOKEN, type TestApp } from './e2e-support/create-app';
import { createFakeTelegramClient } from './e2e-support/fake-telegram-client';
import { withCsrf } from './e2e-support/http';
import {
  createChannelTestHelpers,
  FAILING_CHAT_ID,
  MANUAL_BODY,
  telegramBody,
} from './e2e-support/channels-fixtures';

// Дублирует ChannelsService.TEST_MESSAGE: импорт сервиса на верхнем уровне
// e2e-файла тянет `utils/encryption.ts` до setTestEnv() и кеширует пустой
// ENCRYPTION_KEY на весь прогон — та же причина, что у динамического импорта
// AppModule в create-app.ts.
const TEST_MESSAGE = 'Проверка связи: кабинет школы Сюань-Сюэ подключён к этому каналу';

const fakeTelegram = createFakeTelegramClient(TEST_BOT_TOKEN, FAILING_CHAT_ID);

describe('Channels (e2e)', () => {
  let testApp: TestApp;
  const { server, postChannel, channelModel, classModel, sessionFor } =
    createChannelTestHelpers(() => testApp);

  beforeAll(async () => {
    testApp = await createTestApp((builder) => {
      builder.overrideProvider(TELEGRAM_CLIENT_FACTORY).useValue(fakeTelegram.factory);
    });
  }, 60_000);

  afterAll(async () => {
    await testApp.close();
  });

  it('GET /channels без cookie — 401 в конверте', async () => {
    const res = await request(server()).get('/api/channels');
    expect(res.status).toBe(401);
    expect((res.body as ApiErrorBody).code).toBe('unauthorized');
  });

  it('ученик: GET и POST /channels — 403', async () => {
    const cookie = await sessionFor([]);

    expect(
      (await request(server()).get('/api/channels').set('Cookie', cookie)).status,
    ).toBe(403);
    expect((await postChannel(cookie, MANUAL_BODY)).status).toBe(403);
  });

  it('cookie учителя без x-requested-with на POST — 403 (CSRF раньше роли)', async () => {
    const cookie = await sessionFor(['teacher']);
    const res = await request(server())
      .post('/api/channels')
      .set('Cookie', cookie)
      .send(MANUAL_BODY);
    expect(res.status).toBe(403);
  });

  describe('учитель', () => {
    it('POST manual → 201, ответа без config', async () => {
      const cookie = await sessionFor(['teacher']);
      const res = await postChannel(cookie, MANUAL_BODY);

      expect(res.status).toBe(201);
      expect(res.body as Record<string, unknown>).not.toHaveProperty('config');
      expect((res.body as ChannelDto).target).toBe('');
    });

    it('POST telegram → 201, target из chatId, config в сырой Mongo зашифрован', async () => {
      const cookie = await sessionFor(['teacher']);
      const body = telegramBody('@school-raw');
      const res = await postChannel(cookie, body);
      const dto = res.body as ChannelDto;

      expect(res.status).toBe(201);
      expect(dto.target).toBe('@school-raw');

      const raw = await channelModel().collection.findOne<{ config?: string }>({
        _id: new Types.ObjectId(dto.id),
      });
      expect(raw?.config).toBeDefined();
      expect(raw?.config).not.toContain('@school-raw');
      expect(() => {
        JSON.parse(raw?.config as string);
      }).toThrow();
    });

    it('POST telegram с уже занятым chatId — 409, тело без config/chatId', async () => {
      const cookie = await sessionFor(['teacher']);
      const chatId = '@dup-e2e';
      await postChannel(cookie, telegramBody(chatId));

      const res = await postChannel(cookie, telegramBody(chatId));

      expect(res.status).toBe(409);
      const body = JSON.stringify(res.body);
      expect(body).not.toContain('config');
      expect(body).not.toContain(chatId);
    });

    it('POST vk с недопустимым peerId — 400, тело без config/токена', async () => {
      const cookie = await sessionFor(['teacher']);
      const secretToken = 'e2e-secret-token-should-not-leak';

      const res = await postChannel(cookie, {
        type: 'vk',
        title: 'Беседа',
        config: { token: secretToken, peerId: 1.5 },
      });

      expect(res.status).toBe(400);
      const body = JSON.stringify(res.body);
      expect(body).not.toContain('config');
      expect(body).not.toContain(secretToken);
    });

    it('GET списка и GET /:id — config нет ни у одного канала', async () => {
      const cookie = await sessionFor(['teacher']);
      const created = await postChannel(cookie, telegramBody());
      const dto = created.body as ChannelDto;

      const list = await request(server()).get('/api/channels').set('Cookie', cookie);
      expect(list.status).toBe(200);
      for (const channel of list.body as Record<string, unknown>[]) {
        expect(channel).not.toHaveProperty('config');
      }

      const got = await request(server())
        .get(`/api/channels/${dto.id}`)
        .set('Cookie', cookie);
      expect(got.body as Record<string, unknown>).not.toHaveProperty('config');
    });

    it('GET /channels?active=false — только выключенные каналы', async () => {
      const cookie = await sessionFor(['teacher']);
      const created = await postChannel(cookie, MANUAL_BODY);
      const dto = created.body as ChannelDto;
      await withCsrf(request(server()).patch(`/api/channels/${dto.id}`))
        .set('Cookie', cookie)
        .send({ active: false });

      const res = await request(server())
        .get('/api/channels')
        .query({ active: false })
        .set('Cookie', cookie);

      expect(res.status).toBe(200);
      expect((res.body as ChannelDto[]).some((c) => c.id === dto.id)).toBe(true);
      expect((res.body as ChannelDto[]).every((c) => !c.active)).toBe(true);
    });

    it('PATCH title/active — применяется', async () => {
      const cookie = await sessionFor(['teacher']);
      const created = await postChannel(cookie, MANUAL_BODY);
      const dto = created.body as ChannelDto;

      const patched = await withCsrf(request(server()).patch(`/api/channels/${dto.id}`))
        .set('Cookie', cookie)
        .send({ title: 'Boosty', active: false });

      expect(patched.status).toBe(200);
      expect((patched.body as ChannelDto).title).toBe('Boosty');
      expect((patched.body as ChannelDto).active).toBe(false);
    });

    it('PATCH config целиком — target и шифротекст меняются', async () => {
      const cookie = await sessionFor(['teacher']);
      const created = await postChannel(cookie, telegramBody());
      const dto = created.body as ChannelDto;
      const before = await channelModel().collection.findOne<{ config?: string }>({
        _id: new Types.ObjectId(dto.id),
      });

      const patched = await withCsrf(request(server()).patch(`/api/channels/${dto.id}`))
        .set('Cookie', cookie)
        .send({ config: { chatId: '@new-channel' } });
      expect(patched.status).toBe(200);
      expect((patched.body as ChannelDto).target).toBe('@new-channel');

      const after = await channelModel().collection.findOne<{ config?: string }>({
        _id: new Types.ObjectId(dto.id),
      });
      expect(after?.config).not.toBe(before?.config);
    });

    it('PATCH { config: null } — 400', async () => {
      const cookie = await sessionFor(['teacher']);
      const created = await postChannel(cookie, telegramBody());
      const dto = created.body as ChannelDto;

      const res = await withCsrf(request(server()).patch(`/api/channels/${dto.id}`))
        .set('Cookie', cookie)
        .send({ config: null });

      expect(res.status).toBe(400);
    });

    it('POST /:id/test manual — { status: "manual" }', async () => {
      const cookie = await sessionFor(['teacher']);
      const created = await postChannel(cookie, MANUAL_BODY);
      const dto = created.body as ChannelDto;

      const res = await withCsrf(
        request(server()).post(`/api/channels/${dto.id}/test`),
      ).set('Cookie', cookie);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'manual' });
    });

    it('POST /:id/test telegram — sent, фейк получил TEST_MESSAGE', async () => {
      const cookie = await sessionFor(['teacher']);
      const chatId = '@school-test';
      const created = await postChannel(cookie, telegramBody(chatId));
      const dto = created.body as ChannelDto;

      const res = await withCsrf(
        request(server()).post(`/api/channels/${dto.id}/test`),
      ).set('Cookie', cookie);

      expect(res.body).toEqual({ status: 'sent' });
      expect(fakeTelegram.sentCalls).toContainEqual({ chatId, text: TEST_MESSAGE });
    });

    it('POST /:id/test telegram: ошибка с токеном в тексте — токен вычищен из ответа', async () => {
      const cookie = await sessionFor(['teacher']);
      const created = await postChannel(cookie, {
        type: 'telegram',
        title: 'Падающий канал',
        config: { chatId: FAILING_CHAT_ID },
      });
      const dto = created.body as ChannelDto;

      const res = await withCsrf(
        request(server()).post(`/api/channels/${dto.id}/test`),
      ).set('Cookie', cookie);

      expect(res.status).toBe(200);
      expect((res.body as { status: string }).status).toBe('failed');
      const body = JSON.stringify(res.body);
      expect(body).not.toContain(TEST_BOT_TOKEN);
    });

    it('DELETE свободного канала — 204', async () => {
      const cookie = await sessionFor(['teacher']);
      const created = await postChannel(cookie, MANUAL_BODY);
      const dto = created.body as ChannelDto;

      const res = await withCsrf(request(server()).delete(`/api/channels/${dto.id}`)).set(
        'Cookie',
        cookie,
      );
      expect(res.status).toBe(204);
    });

    it('DELETE канала, подключённого к занятию, — 409, канал остаётся', async () => {
      const cookie = await sessionFor(['teacher']);
      const created = await postChannel(cookie, MANUAL_BODY);
      const dto = created.body as ChannelDto;

      await classModel().create({
        title: 'Тайцзицюань',
        format: 'online',
        channelIds: [dto.id],
      });

      const res = await withCsrf(request(server()).delete(`/api/channels/${dto.id}`)).set(
        'Cookie',
        cookie,
      );
      expect(res.status).toBe(409);

      const stillThere = await request(server())
        .get(`/api/channels/${dto.id}`)
        .set('Cookie', cookie);
      expect(stillThere.status).toBe(200);
    });
  });

  it('админ: GET /channels — 200, config нет ни у одного канала (роль школы, не владение)', async () => {
    const cookie = await sessionFor(['admin']);
    const res = await request(server()).get('/api/channels').set('Cookie', cookie);
    expect(res.status).toBe(200);
    for (const channel of res.body as Record<string, unknown>[]) {
      expect(channel).not.toHaveProperty('config');
    }
  });
});
