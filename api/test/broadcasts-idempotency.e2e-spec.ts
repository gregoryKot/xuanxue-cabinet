// e2e на идемпотентность POST /broadcasts (docs/PLAN.md §6 «Рассылки»,
// CLAUDE.md «API»): повтор с тем же idempotencyKey — тот же результат, не
// вторая рассылка и не второй набор доставок. Разовая рассылка (создание,
// журнал) — broadcasts.e2e-spec.ts, файл-лимит e2e 300 строк не даёт держать
// всё в одном (CLAUDE.md «Храповики»).
import { randomUUID } from 'crypto';
import { getModelToken } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import request from 'supertest';
import type { ApiErrorBody, BroadcastDto, UserRole } from '@xuanxue/shared';
import { BroadcastRecord } from '../src/broadcasts/broadcast.schema';
import { ChannelRecord } from '../src/channels/channel.schema';
import { DeliveryRecord } from '../src/deliveries/delivery.schema';
import { createTestApp, type TestApp } from './e2e-support/create-app';
import { sessionCookieFor, withCsrf } from './e2e-support/http';

describe('Идемпотентность POST /broadcasts (e2e)', () => {
  let testApp: TestApp;
  let broadcastModel: Model<BroadcastRecord>;
  let deliveryModel: Model<DeliveryRecord>;
  let channelModel: Model<ChannelRecord>;
  let cookie: string;
  let channelId: string;

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
    cookie = await sessionCookieFor(testApp.app, ['teacher'] as UserRole[]);
  }, 60_000);

  afterAll(async () => {
    await testApp.close();
  });

  afterEach(async () => {
    await broadcastModel.deleteMany({});
    await deliveryModel.deleteMany({});
    await channelModel.deleteMany({});
  });

  beforeEach(async () => {
    const channel = await channelModel.create({
      type: 'manual',
      title: 'Boosty',
      config: '{}',
      target: '',
      active: true,
    });
    channelId = channel._id.toString();
  });

  function postBroadcast(body: Record<string, unknown>): request.Test {
    return withCsrf(request(testApp.app.getHttpServer()).post('/api/broadcasts'))
      .set('Cookie', cookie)
      .send(body);
  }

  it('тот же idempotencyKey дважды — один документ, один набор доставок, тот же id', async () => {
    const body = {
      text: 'Итог месяца',
      channelIds: [channelId],
      idempotencyKey: randomUUID(),
    };

    const first = await postBroadcast(body);
    const second = await postBroadcast(body);

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    const firstDto = first.body as BroadcastDto;
    const secondDto = second.body as BroadcastDto;
    expect(secondDto.id).toBe(firstDto.id);
    await expect(broadcastModel.countDocuments({})).resolves.toBe(1);
    await expect(
      deliveryModel.countDocuments({ broadcastId: firstDto.id }),
    ).resolves.toBe(1);
  });

  it('разные idempotencyKey — две рассылки', async () => {
    const first = await postBroadcast({
      text: 'Итог месяца',
      channelIds: [channelId],
      idempotencyKey: randomUUID(),
    });
    const second = await postBroadcast({
      text: 'Итог месяца',
      channelIds: [channelId],
      idempotencyKey: randomUUID(),
    });

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect((first.body as BroadcastDto).id).not.toBe((second.body as BroadcastDto).id);
    await expect(broadcastModel.countDocuments({})).resolves.toBe(2);
  });

  // Как «POST без текста/каналов — 400» в broadcasts.e2e-spec.ts: отсутствующее
  // обязательное поле — стандартное сообщение class-validator, статус
  // достаточен (без своего @IsString-текста, конвенция файла).
  it('без idempotencyKey — 400', async () => {
    const res = await postBroadcast({ text: 'x', channelIds: [channelId] });
    expect(res.status).toBe(400);
  });

  it('слишком короткий idempotencyKey — 400 с текстом лимита в details', async () => {
    const res = await postBroadcast({
      text: 'x',
      channelIds: [channelId],
      idempotencyKey: 'short',
    });

    expect(res.status).toBe(400);
    const body = res.body as ApiErrorBody;
    expect(body.details).toContain('Ключ повтора: от 36 до 64 символов.');
  });
});
