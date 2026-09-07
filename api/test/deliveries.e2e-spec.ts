// e2e на /deliveries — данные школы (ADR-0010): доступ по роли, не по
// владельцу (e2e-support/README.md, «данные школы»). Настоящий AppModule на
// MongoMemoryServer.
import { getModelToken } from '@nestjs/mongoose';
import { DateTime } from 'luxon';
import { Types, type Model } from 'mongoose';
import request from 'supertest';
import type {
  ApiErrorBody,
  DeliveryDto,
  DeliveryStatus,
  UserRole,
} from '@xuanxue/shared';
import { BroadcastRecord } from '../src/broadcasts/broadcast.schema';
import { ChannelRecord } from '../src/channels/channel.schema';
import { DeliveryRecord } from '../src/deliveries/delivery.schema';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { sessionCookieFor, withCsrf } from './e2e-support/http';

describe('Deliveries (e2e)', () => {
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

  async function seed(
    channelType: 'manual' | 'telegram',
    deliveryStatus: DeliveryStatus,
  ): Promise<{ deliveryId: string; broadcastId: string }> {
    const channel = await channelModel.create({
      type: channelType,
      title: channelType === 'manual' ? 'Boosty' : 'Канал школы',
      config: '{}',
      target: '',
      active: true,
    });
    const broadcast = await broadcastModel.create({
      kind: 'manual',
      channelIds: [channel._id],
      scheduledAt: DateTime.utc().toJSDate(),
      text: 'Текст рассылки',
      status: 'scheduled',
    });
    const delivery = await deliveryModel.create({
      broadcastId: broadcast._id,
      channelId: channel._id,
      status: deliveryStatus,
    });
    return { deliveryId: delivery._id.toString(), broadcastId: broadcast._id.toString() };
  }

  it('GET /deliveries/:id без cookie — 401 в конверте', async () => {
    const { deliveryId } = await seed('manual', 'manual');
    const res = await request(server()).get(`/api/deliveries/${deliveryId}`);
    expect(res.status).toBe(401);
    expect((res.body as ApiErrorBody).code).toBe('unauthorized');
  });

  it.each([
    ['ученик', ['student'] as UserRole[]],
    ['гость', [] as UserRole[]],
  ])('%s: GET и POST mark-sent — 403', async (_label, roles) => {
    const { deliveryId } = await seed('manual', 'manual');
    const cookie = await sessionFor(roles);

    const getRes = await request(server())
      .get(`/api/deliveries/${deliveryId}`)
      .set('Cookie', cookie);
    expect(getRes.status).toBe(403);

    const markRes = await withCsrf(
      request(server()).post(`/api/deliveries/${deliveryId}/mark-sent`),
    ).set('Cookie', cookie);
    expect(markRes.status).toBe(403);
  });

  describe('учитель', () => {
    it('GET /:id — text только у manual-канала, у telegram отсутствует', async () => {
      const cookie = await sessionFor(['teacher']);
      const manual = await seed('manual', 'manual');
      const telegram = await seed('telegram', 'pending');

      const manualRes = await request(server())
        .get(`/api/deliveries/${manual.deliveryId}`)
        .set('Cookie', cookie);
      expect(manualRes.status).toBe(200);
      expect((manualRes.body as DeliveryDto).text).toBe('Текст рассылки');

      const telegramRes = await request(server())
        .get(`/api/deliveries/${telegram.deliveryId}`)
        .set('Cookie', cookie);
      expect(telegramRes.status).toBe(200);
      expect((telegramRes.body as DeliveryDto).text).toBeUndefined();
    });

    it('POST mark-sent на manual → 200 sent, broadcast пересчитан', async () => {
      const cookie = await sessionFor(['teacher']);
      const { deliveryId, broadcastId } = await seed('manual', 'manual');

      const res = await withCsrf(
        request(server()).post(`/api/deliveries/${deliveryId}/mark-sent`),
      ).set('Cookie', cookie);

      expect(res.status).toBe(200);
      expect((res.body as DeliveryDto).status).toBe('sent');
      const broadcast = await broadcastModel.findById(broadcastId).lean();
      expect(broadcast?.status).toBe('sent');
    });

    it('POST mark-sent на manual-канал со статусом pending (учитель успел раньше тика) → 200 sent', async () => {
      const cookie = await sessionFor(['teacher']);
      const { deliveryId } = await seed('manual', 'pending');

      const res = await withCsrf(
        request(server()).post(`/api/deliveries/${deliveryId}/mark-sent`),
      ).set('Cookie', cookie);

      expect(res.status).toBe(200);
      expect((res.body as DeliveryDto).status).toBe('sent');
    });

    it('POST mark-sent на telegram-доставку — 409 «уходит сама», статус не меняется', async () => {
      const cookie = await sessionFor(['teacher']);
      const { deliveryId } = await seed('telegram', 'pending');

      const res = await withCsrf(
        request(server()).post(`/api/deliveries/${deliveryId}/mark-sent`),
      ).set('Cookie', cookie);
      expect(res.status).toBe(409);
      expect((res.body as ApiErrorBody).message).toContain('уходит сама');

      const stored = await deliveryModel.findById(deliveryId).lean();
      expect(stored?.status).toBe('pending');
    });

    it('POST mark-sent на уже отправленную — 409', async () => {
      const cookie = await sessionFor(['teacher']);
      const { deliveryId } = await seed('manual', 'sent');

      const res = await withCsrf(
        request(server()).post(`/api/deliveries/${deliveryId}/mark-sent`),
      ).set('Cookie', cookie);
      expect(res.status).toBe(409);
    });

    it('несуществующий и мусорный id — 404', async () => {
      const cookie = await sessionFor(['teacher']);

      const missing = await request(server())
        .get(`/api/deliveries/${new Types.ObjectId().toString()}`)
        .set('Cookie', cookie);
      expect(missing.status).toBe(404);

      const garbage = await request(server())
        .get('/api/deliveries/not-an-id')
        .set('Cookie', cookie);
      expect(garbage.status).toBe(404);
    });
  });

  it('админ: GET /:id — 200 (роль школы, не владение)', async () => {
    const { deliveryId } = await seed('manual', 'manual');
    const cookie = await sessionFor(['admin']);

    const res = await request(server())
      .get(`/api/deliveries/${deliveryId}`)
      .set('Cookie', cookie);
    expect(res.status).toBe(200);
  });

  describe('GET /deliveries — экран «проблемы»', () => {
    it('без status — все доставки; ученик/гость — 403', async () => {
      await seed('manual', 'sent');
      await seed('telegram', 'failed');
      const cookie = await sessionFor(['teacher']);

      const res = await request(server()).get('/api/deliveries').set('Cookie', cookie);
      expect(res.status).toBe(200);
      expect(res.body as DeliveryDto[]).toHaveLength(2);

      const forbidden = await request(server())
        .get('/api/deliveries')
        .set('Cookie', await sessionFor(['student']));
      expect(forbidden.status).toBe(403);
    });

    it('status сужает список', async () => {
      await seed('manual', 'sent');
      const failed = await seed('telegram', 'failed');
      const cookie = await sessionFor(['teacher']);

      const res = await request(server())
        .get('/api/deliveries?status=failed')
        .set('Cookie', cookie);

      expect(res.status).toBe(200);
      const found = res.body as DeliveryDto[];
      expect(found).toHaveLength(1);
      expect(found[0]?.id).toBe(failed.deliveryId);
    });
  });
});
