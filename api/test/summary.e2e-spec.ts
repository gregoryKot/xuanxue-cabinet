// e2e на /summary (docs/PLAN.md §6 «Сводка», CLAUDE.md «Продуктовая фича =
// число в „Сводке“»). Данные школы (ADR-0010): доступ по роли.
import { getModelToken } from '@nestjs/mongoose';
import { DateTime } from 'luxon';
import type { Model } from 'mongoose';
import request from 'supertest';
import type { SummaryDto, UserRole } from '@xuanxue/shared';
import { BroadcastRecord } from '../src/broadcasts/broadcast.schema';
import { ChannelRecord } from '../src/channels/channel.schema';
import { DeliveryRecord } from '../src/deliveries/delivery.schema';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { sessionCookieFor } from './e2e-support/http';

describe('Summary (e2e)', () => {
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

  it('без cookie — 401; ученик — 403', async () => {
    const anon = await request(server()).get('/api/summary');
    expect(anon.status).toBe(401);

    const cookie = await sessionFor(['student']);
    const res = await request(server()).get('/api/summary').set('Cookie', cookie);
    expect(res.status).toBe(403);
  });

  it('пустая база — emptyMessage', async () => {
    const cookie = await sessionFor(['teacher']);

    const res = await request(server()).get('/api/summary').set('Cookie', cookie);

    expect(res.status).toBe(200);
    const dto = res.body as SummaryDto;
    expect(dto.emptyMessage).toBe('Пока нечего показать: ни одной рассылки за 30 дней.');
  });

  it('после одной sent-доставки — broadcastsSent = 1, без emptyMessage', async () => {
    const channel = await channelModel.create({
      type: 'manual',
      title: 'Boosty',
      config: '{}',
      target: '',
      active: true,
    });
    const now = DateTime.utc().toJSDate();
    const broadcast = await broadcastModel.create({
      kind: 'manual',
      channelIds: [channel._id],
      scheduledAt: now,
      sentAt: now,
      text: 'x',
      status: 'sent',
    });
    await deliveryModel.create({
      broadcastId: broadcast._id,
      channelId: channel._id,
      status: 'sent',
    });

    const cookie = await sessionFor(['admin']);
    const res = await request(server()).get('/api/summary').set('Cookie', cookie);

    expect(res.status).toBe(200);
    const dto = res.body as SummaryDto;
    expect(dto.broadcastsSent).toBe(1);
    expect(dto.emptyMessage).toBeUndefined();
  });
});
