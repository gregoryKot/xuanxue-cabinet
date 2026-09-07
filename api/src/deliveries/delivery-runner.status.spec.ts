// Против настоящей Mongo (CLAUDE.md «Тесты» — не мок модели): пересчёт
// broadcast.status напрямую, без раннера и без HTTP — manual-доставка не
// закрывает рассылку сама, только по кнопке «отметить отправленным»
// (DeliveriesService.markSent).
import { DateTime } from 'luxon';
import mongoose, { type Connection, type Model } from 'mongoose';
import { BroadcastRecord, BroadcastSchema } from '../broadcasts/broadcast.schema';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { DeliveryRecord, DeliverySchema } from './delivery.schema';
import { refreshBroadcastStatus } from './delivery-runner.status';

const NOW = DateTime.fromISO('2026-09-06T18:00:00Z', { zone: 'utc' });

describe('refreshBroadcastStatus', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let broadcastModel: Model<BroadcastRecord>;
  let deliveryModel: Model<DeliveryRecord>;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    broadcastModel = connection.model<BroadcastRecord>(
      BroadcastRecord.name,
      BroadcastSchema,
    );
    deliveryModel = connection.model<DeliveryRecord>(DeliveryRecord.name, DeliverySchema);
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  afterEach(async () => {
    await Promise.all([broadcastModel.deleteMany({}), deliveryModel.deleteMany({})]);
  });

  async function seedBroadcast(): Promise<mongoose.Types.ObjectId> {
    const broadcast = await broadcastModel.create({
      kind: 'manual',
      channelIds: [],
      scheduledAt: NOW.toJSDate(),
      text: 'т',
      status: 'scheduled',
    });
    return broadcast._id;
  }

  it('смесь sent + manual — broadcast остаётся scheduled', async () => {
    const broadcastId = await seedBroadcast();
    await deliveryModel.create([
      { broadcastId, channelId: new mongoose.Types.ObjectId(), status: 'sent' },
      { broadcastId, channelId: new mongoose.Types.ObjectId(), status: 'manual' },
    ]);

    await refreshBroadcastStatus(deliveryModel, broadcastModel, broadcastId, NOW);

    const stored = await broadcastModel.findById(broadcastId).lean();
    expect(stored?.status).toBe('scheduled');
  });

  it('после того как manual тоже стала sent (mark-sent) — broadcast sent', async () => {
    const broadcastId = await seedBroadcast();
    const manualChannelId = new mongoose.Types.ObjectId();
    await deliveryModel.create([
      { broadcastId, channelId: new mongoose.Types.ObjectId(), status: 'sent' },
      { broadcastId, channelId: manualChannelId, status: 'manual' },
    ]);
    // markSent переводит именно эту доставку в sent — здесь эмулируем сам факт.
    await deliveryModel.updateOne(
      { broadcastId, channelId: manualChannelId },
      { $set: { status: 'sent', sentAt: NOW.toJSDate() } },
    );

    await refreshBroadcastStatus(deliveryModel, broadcastModel, broadcastId, NOW);

    const stored = await broadcastModel.findById(broadcastId).lean();
    expect(stored?.status).toBe('sent');
    expect(stored?.sentAt).toBeDefined();
  });

  it('нет доставок — пересчёт документ не трогает', async () => {
    const broadcastId = await seedBroadcast();

    await refreshBroadcastStatus(deliveryModel, broadcastModel, broadcastId, NOW);

    const stored = await broadcastModel.findById(broadcastId).lean();
    expect(stored?.status).toBe('scheduled');
  });
});
