// Против настоящей Mongo (CLAUDE.md «Тесты»): предел выборки — часть самого
// запроса Mongo (`.limit()`), не пост-фильтр в JS — мок модели такое не
// поймал бы. Остальное поведение findClaimable (какие статусы считаются
// кандидатами, лизинг DELIVERY_STALE_LOCK_MIN) — delivery-runner.service.spec.ts,
// здесь — только предел «дай всё» запрещено (CLAUDE.md «API»).
import { DateTime } from 'luxon';
import type { Connection, Model } from 'mongoose';
import { Types } from 'mongoose';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { DeliveryRecord, DeliverySchema } from './delivery.schema';
import { CLAIM_BATCH_LIMIT, findClaimable } from './delivery-runner.queries';

const NOW = DateTime.fromISO('2026-09-06T18:00:00Z', { zone: 'utc' });

describe('findClaimable', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let deliveryModel: Model<DeliveryRecord>;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    deliveryModel = connection.model<DeliveryRecord>(DeliveryRecord.name, DeliverySchema);
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  afterEach(async () => {
    await deliveryModel.deleteMany({});
  });

  it(`кандидатов на 1 больше лимита — выборка не превышает CLAIM_BATCH_LIMIT (${CLAIM_BATCH_LIMIT})`, async () => {
    const docs = Array.from({ length: CLAIM_BATCH_LIMIT + 1 }, () => ({
      broadcastId: new Types.ObjectId(),
      channelId: new Types.ObjectId(),
      status: 'pending' as const,
    }));
    await deliveryModel.insertMany(docs);

    const claimable = await findClaimable(deliveryModel, NOW);

    expect(claimable).toHaveLength(CLAIM_BATCH_LIMIT);
  });
});
