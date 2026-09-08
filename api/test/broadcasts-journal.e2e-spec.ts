// e2e на журнал `/broadcasts` — GET-список, GET .../deliveries, POST .../cancel
// (docs/PLAN.md §6 «Рассылки»). Данные школы (ADR-0010): доступ по роли, не
// по владельцу (e2e-support/README.md). Разовая рассылка (POST/GET :id) —
// broadcasts.e2e-spec.ts, файл-лимит e2e 300 строк не даёт держать всё в
// одном (CLAUDE.md «Храповики»).
import { randomUUID } from 'crypto';
import { getModelToken } from '@nestjs/mongoose';
import { DateTime } from 'luxon';
import { Types, type Model } from 'mongoose';
import request from 'supertest';
import type { ApiErrorBody, BroadcastDto, DeliveryDto, UserRole } from '@xuanxue/shared';
import { BroadcastRecord } from '../src/broadcasts/broadcast.schema';
import { ChannelRecord } from '../src/channels/channel.schema';
import { DeliveryRecord } from '../src/deliveries/delivery.schema';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { sessionCookieFor, withCsrf } from './e2e-support/http';

describe('Журнал рассылок (e2e)', () => {
  let testApp: TestApp;
  let broadcastModel: Model<BroadcastRecord>;
  let deliveryModel: Model<DeliveryRecord>;
  let channelModel: Model<ChannelRecord>;

  beforeAll(async () => {
    testApp = await createTestApp();
    broadcastModel = testApp.app.get<Model<BroadcastRecord>>(
      getModelToken(BroadcastRecord.name),
      { strict: false },
    );
    deliveryModel = testApp.app.get<Model<DeliveryRecord>>(
      getModelToken(DeliveryRecord.name),
      { strict: false },
    );
    channelModel = testApp.app.get<Model<ChannelRecord>>(
      getModelToken(ChannelRecord.name),
      { strict: false },
    );
  }, 60_000);

  afterAll(async () => {
    await testApp.close();
  });

  afterEach(async () => {
    await broadcastModel.deleteMany({});
    await deliveryModel.deleteMany({});
    await channelModel.deleteMany({});
  });

  function server(): ReturnType<TestApp['app']['getHttpServer']> {
    return testApp.app.getHttpServer();
  }

  async function sessionFor(roles: UserRole[]): Promise<string> {
    return sessionCookieFor(testApp.app, roles);
  }

  async function createChannel(
    overrides: Partial<{
      type: 'manual' | 'telegram';
      title: string;
      active: boolean;
    }> = {},
  ): Promise<string> {
    const channel = await channelModel.create({
      type: 'manual',
      title: 'Boosty',
      config: '{}',
      target: '',
      active: true,
      ...overrides,
    });
    return channel._id.toString();
  }

  async function postBroadcast(cookie: string, channelId: string): Promise<BroadcastDto> {
    const res = await withCsrf(request(server()).post('/api/broadcasts'))
      .set('Cookie', cookie)
      .send({
        text: 'Итог месяца',
        channelIds: [channelId],
        idempotencyKey: randomUUID(),
      });
    return res.body as BroadcastDto;
  }

  it('GET /broadcasts без cookie — 401; ученик/гость — 403', async () => {
    const anon = await request(server()).get(
      '/api/broadcasts?from=2026-01-01T00:00:00Z&to=2026-01-08T00:00:00Z',
    );
    expect(anon.status).toBe(401);

    const cookie = await sessionFor(['student']);
    const res = await request(server())
      .get('/api/broadcasts?from=2026-01-01T00:00:00Z&to=2026-01-08T00:00:00Z')
      .set('Cookie', cookie);
    expect(res.status).toBe(403);
  });

  it('GET /broadcasts без окна — 400; окно шире 8 недель — 400', async () => {
    const cookie = await sessionFor(['teacher']);

    const noWindow = await request(server()).get('/api/broadcasts').set('Cookie', cookie);
    expect(noWindow.status).toBe(400);

    const tooWide = await request(server())
      .get('/api/broadcasts?from=2026-01-01T00:00:00Z&to=2026-04-01T00:00:00Z')
      .set('Cookie', cookie);
    expect(tooWide.status).toBe(400);
    expect((tooWide.body as ApiErrorBody).message).toContain('8 недел');
  });

  it('GET /broadcasts — рассылка в окне видна, вне окна — нет', async () => {
    const cookie = await sessionFor(['teacher']);
    const channelId = await createChannel();
    const created = await postBroadcast(cookie, channelId);
    const from = DateTime.utc().minus({ days: 1 }).toISO() ?? '';
    const to = DateTime.utc().plus({ days: 1 }).toISO() ?? '';

    const res = await request(server())
      .get(`/api/broadcasts?from=${from}&to=${to}`)
      .set('Cookie', cookie);

    expect(res.status).toBe(200);
    const list = res.body as BroadcastDto[];
    expect(list.map((b) => b.id)).toContain(created.id);
  });

  describe('GET /broadcasts/:id/deliveries', () => {
    it('text только у manual-канала', async () => {
      const cookie = await sessionFor(['teacher']);
      const manualId = await createChannel();
      const telegramId = await createChannel({ type: 'telegram', title: 'Канал школы' });
      const res = await withCsrf(request(server()).post('/api/broadcasts'))
        .set('Cookie', cookie)
        .send({
          text: 'Общий текст',
          channelIds: [manualId, telegramId],
          idempotencyKey: randomUUID(),
        });
      const created = res.body as BroadcastDto;

      const got = await request(server())
        .get(`/api/broadcasts/${created.id}/deliveries`)
        .set('Cookie', cookie);

      expect(got.status).toBe(200);
      const deliveries = got.body as DeliveryDto[];
      expect(deliveries).toHaveLength(2);
      const manual = deliveries.find((d) => d.channelId === manualId);
      const telegram = deliveries.find((d) => d.channelId === telegramId);
      expect(manual?.text).toBe('Общий текст');
      expect(telegram?.text).toBeUndefined();
    });

    it('несуществующая рассылка — 404', async () => {
      const cookie = await sessionFor(['teacher']);
      const res = await request(server())
        .get(`/api/broadcasts/${new Types.ObjectId().toString()}/deliveries`)
        .set('Cookie', cookie);
      expect(res.status).toBe(404);
    });
  });

  describe('POST /broadcasts/:id/cancel', () => {
    it('scheduled → 200 cancelled, доставка cancelled', async () => {
      const cookie = await sessionFor(['teacher']);
      const channelId = await createChannel();
      const created = await postBroadcast(cookie, channelId);

      const res = await withCsrf(
        request(server()).post(`/api/broadcasts/${created.id}/cancel`),
      ).set('Cookie', cookie);

      expect(res.status).toBe(200);
      expect((res.body as BroadcastDto).status).toBe('cancelled');
      const delivery = await deliveryModel.findOne({ broadcastId: created.id }).lean();
      expect(delivery?.status).toBe('cancelled');
    });

    it('уже отправленную — 409 «Отменить нечего»', async () => {
      const cookie = await sessionFor(['teacher']);
      const channelId = await createChannel();
      const created = await postBroadcast(cookie, channelId);
      await broadcastModel.updateOne({ _id: created.id }, { $set: { status: 'sent' } });

      const res = await withCsrf(
        request(server()).post(`/api/broadcasts/${created.id}/cancel`),
      ).set('Cookie', cookie);

      expect(res.status).toBe(409);
      expect((res.body as ApiErrorBody).message).toContain('Отменить нечего');
    });

    it('несуществующую — 404; без x-requested-with — 403', async () => {
      const cookie = await sessionFor(['teacher']);
      const channelId = await createChannel();
      const created = await postBroadcast(cookie, channelId);

      const missing = await withCsrf(
        request(server()).post(
          `/api/broadcasts/${new Types.ObjectId().toString()}/cancel`,
        ),
      ).set('Cookie', cookie);
      expect(missing.status).toBe(404);

      const noCsrf = await request(server())
        .post(`/api/broadcasts/${created.id}/cancel`)
        .set('Cookie', cookie);
      expect(noCsrf.status).toBe(403);
    });
  });
});
