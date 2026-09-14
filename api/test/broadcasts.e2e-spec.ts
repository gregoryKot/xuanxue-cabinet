// e2e на /broadcasts — данные школы (ADR-0010): доступ по роли, не по
// владельцу (e2e-support/README.md, «данные школы»). Настоящий AppModule на
// MongoMemoryServer. Идемпотентность POST (тот же/другой idempotencyKey,
// «без ключа — 400») — отдельно, broadcasts-idempotency.e2e-spec.ts (файл-лимит
// e2e, CLAUDE.md «Храповики»); здесь `postBroadcast` просто подставляет
// случайный ключ, если тест не задал свой явно.
import { randomUUID } from 'crypto';
import { getModelToken } from '@nestjs/mongoose';
import { DateTime } from 'luxon';
import { Types, type Model } from 'mongoose';
import request from 'supertest';
import type { ApiErrorBody, BroadcastDto, UserRole } from '@xuanxue/shared';
import { BroadcastRecord } from '../src/broadcasts/broadcast.schema';
import { ChannelRecord } from '../src/channels/channel.schema';
import { DeliveryRecord } from '../src/deliveries/delivery.schema';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { sessionCookieFor, withCsrf } from './e2e-support/http';

describe('Broadcasts (e2e)', () => {
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

  async function createChannel(overrides: Partial<ChannelRecord> = {}): Promise<string> {
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

  function postBroadcast(cookie: string, body: Record<string, unknown>): request.Test {
    // idempotencyKey по умолчанию — тесты в этом файле не про идемпотентность
    // (та часть — broadcasts-idempotency.e2e-spec.ts); `body.idempotencyKey`,
    // если тест его задал сам, перекрывает дефолт (порядок spread).
    return withCsrf(request(server()).post('/api/broadcasts'))
      .set('Cookie', cookie)
      .send({ idempotencyKey: randomUUID(), ...body });
  }

  it('POST /broadcasts без cookie — 401 в конверте', async () => {
    const res = await withCsrf(request(server()).post('/api/broadcasts')).send({
      text: 'x',
      channelIds: [],
    });
    expect(res.status).toBe(401);
    expect((res.body as ApiErrorBody).code).toBe('unauthorized');
  });

  it('ученик: POST /broadcasts — 403', async () => {
    const cookie = await sessionFor([]);
    const channelId = await createChannel();

    const res = await postBroadcast(cookie, { text: 'x', channelIds: [channelId] });
    expect(res.status).toBe(403);
  });

  it('cookie учителя без x-requested-with — 403 (CSRF раньше роли)', async () => {
    const cookie = await sessionFor(['teacher']);
    const channelId = await createChannel();

    const res = await request(server())
      .post('/api/broadcasts')
      .set('Cookie', cookie)
      .send({ text: 'x', channelIds: [channelId] });
    expect(res.status).toBe(403);
  });

  describe('учитель', () => {
    it('POST → 201, kind manual, text в сырой Mongo зашифрован', async () => {
      const cookie = await sessionFor(['teacher']);
      const channelId = await createChannel();

      const res = await postBroadcast(cookie, {
        text: 'Итоги месяца — спасибо всем!',
        channelIds: [channelId],
      });

      expect(res.status).toBe(201);
      const dto = res.body as BroadcastDto;
      expect(dto.kind).toBe('manual');
      expect(dto.status).toBe('scheduled');
      expect(dto.text).toBe('Итоги месяца — спасибо всем!');

      const raw = await broadcastModel.collection.findOne<{ text?: string }>({
        _id: new Types.ObjectId(dto.id),
      });
      expect(raw?.text).toBeDefined();
      expect(raw?.text).not.toContain('Итоги месяца');

      const deliveries = await deliveryModel.find({ broadcastId: dto.id }).lean();
      expect(deliveries).toHaveLength(1);
      expect(deliveries[0]?.status).toBe('pending');
    });

    it('POST со scheduledAt в будущем → доставка с nextAttemptAt на это время', async () => {
      const cookie = await sessionFor(['teacher']);
      const channelId = await createChannel();
      // От реального «сейчас», не литерал — иначе тест устареет сам по себе
      // (CLAUDE.md «Тесты»: детерминизм, но здесь own DateTime.utc() — сама
      // e2e не умеет подменить время контроллера).
      const scheduledAt = DateTime.utc().plus({ years: 5 });

      const res = await postBroadcast(cookie, {
        text: 'Позже',
        channelIds: [channelId],
        scheduledAt: scheduledAt.toISO(),
      });

      expect(res.status).toBe(201);
      const delivery = await deliveryModel
        .findOne({ broadcastId: (res.body as BroadcastDto).id })
        .lean();
      expect(delivery?.nextAttemptAt?.toISOString()).toBe(
        scheduledAt.toJSDate().toISOString(),
      );
    });

    it('POST с несуществующим каналом — 400 «удалён», без документа в базе', async () => {
      const cookie = await sessionFor(['teacher']);

      const res = await postBroadcast(cookie, {
        text: 'x',
        channelIds: [new Types.ObjectId().toString()],
      });

      expect(res.status).toBe(400);
      expect((res.body as ApiErrorBody).message).toContain('удалён');
      await expect(broadcastModel.countDocuments({})).resolves.toBe(0);
    });

    it('POST с выключенным каналом — 400 с его именем', async () => {
      const cookie = await sessionFor(['teacher']);
      const channelId = await createChannel({ active: false });

      const res = await postBroadcast(cookie, { text: 'x', channelIds: [channelId] });

      expect(res.status).toBe(400);
      expect((res.body as ApiErrorBody).message).toContain('Boosty');
    });

    it('POST без текста/каналов — 400', async () => {
      const cookie = await sessionFor(['teacher']);

      const res = await postBroadcast(cookie, { text: '', channelIds: [] });
      expect(res.status).toBe(400);
    });

    it('POST с дублем channelIds в теле — 400, не 500', async () => {
      const cookie = await sessionFor(['teacher']);
      const channelId = await createChannel();

      const res = await postBroadcast(cookie, {
        text: 'x',
        channelIds: [channelId, channelId],
      });

      expect(res.status).toBe(400);
    });

    it('GET /:id — 200 с ранее созданной рассылкой; несуществующий — 404', async () => {
      const cookie = await sessionFor(['teacher']);
      const channelId = await createChannel();
      const created = await postBroadcast(cookie, { text: 'x', channelIds: [channelId] });
      const dto = created.body as BroadcastDto;

      const got = await request(server())
        .get(`/api/broadcasts/${dto.id}`)
        .set('Cookie', cookie);
      expect(got.status).toBe(200);
      expect((got.body as BroadcastDto).text).toBe('x');

      const missing = await request(server())
        .get(`/api/broadcasts/${new Types.ObjectId().toString()}`)
        .set('Cookie', cookie);
      expect(missing.status).toBe(404);
    });
  });

  it('админ: GET /:id — 200 (роль школы, не владение)', async () => {
    const teacherCookie = await sessionFor(['teacher']);
    const channelId = await createChannel();
    const created = await postBroadcast(teacherCookie, {
      text: 'x',
      channelIds: [channelId],
    });
    const dto = created.body as BroadcastDto;

    const adminCookie = await sessionFor(['admin']);
    const res = await request(server())
      .get(`/api/broadcasts/${dto.id}`)
      .set('Cookie', adminCookie);
    expect(res.status).toBe(200);
  });
});
