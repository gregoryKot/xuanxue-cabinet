// Против настоящей Mongo (CLAUDE.md «Тесты»): cancelBroadcast — атомарный CAS
// по статусу, не read-then-write, поэтому важно проверять реальный
// updateOne/matchedCount, а не мок. Обвязка BroadcastsService.createManual —
// в broadcasts.service.spec.ts (доступ, шифрование, e2e-путь); здесь —
// прямые вызовы cancelBroadcast на голых моделях, без лишней обвязки.
import { Types, type Connection, type Model } from 'mongoose';
import { ChannelRecord, ChannelSchema } from '../channels/channel.schema';
import { DeliveryRecord, DeliverySchema } from '../deliveries/delivery.schema';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { BroadcastRecord, BroadcastSchema } from './broadcast.schema';
import { cancelBroadcast } from './broadcast-journal.queries';

describe('cancelBroadcast', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let broadcastModel: Model<BroadcastRecord>;
  let deliveryModel: Model<DeliveryRecord>;
  let channelModel: Model<ChannelRecord>;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    broadcastModel = connection.model<BroadcastRecord>(
      BroadcastRecord.name,
      BroadcastSchema,
    );
    deliveryModel = connection.model<DeliveryRecord>(DeliveryRecord.name, DeliverySchema);
    channelModel = connection.model<ChannelRecord>(ChannelRecord.name, ChannelSchema);
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  afterEach(async () => {
    await Promise.all([
      broadcastModel.deleteMany({}),
      deliveryModel.deleteMany({}),
      channelModel.deleteMany({}),
    ]);
  });

  async function seedBroadcast(status: BroadcastRecord['status'] = 'scheduled') {
    const channel = await channelModel.create({
      type: 'manual',
      title: 'Boosty',
      config: '{}',
      target: '',
      active: true,
    });
    return broadcastModel.create({
      kind: 'manual',
      channelIds: [channel._id],
      scheduledAt: new Date(),
      text: 'x',
      status,
    });
  }

  it('scheduled → cancelled; pending и manual доставки — cancelled, sending — нет', async () => {
    const broadcast = await seedBroadcast();
    const [pending, manual, sending] = await deliveryModel.create([
      { broadcastId: broadcast._id, channelId: new Types.ObjectId(), status: 'pending' },
      { broadcastId: broadcast._id, channelId: new Types.ObjectId(), status: 'manual' },
      { broadcastId: broadcast._id, channelId: new Types.ObjectId(), status: 'sending' },
    ]);

    await cancelBroadcast(broadcastModel, deliveryModel, broadcast._id.toString());

    const stored = await broadcastModel.findById(broadcast._id).lean();
    expect(stored?.status).toBe('cancelled');
    await expect(deliveryModel.findById(pending?._id).lean()).resolves.toMatchObject({
      status: 'cancelled',
    });
    await expect(deliveryModel.findById(manual?._id).lean()).resolves.toMatchObject({
      status: 'cancelled',
    });
    await expect(deliveryModel.findById(sending?._id).lean()).resolves.toMatchObject({
      status: 'sending',
    });
  });

  it('sent → 409 «Уже отправлено. Отменить нечего.», статус не меняется', async () => {
    const broadcast = await seedBroadcast('sent');

    await expect(
      cancelBroadcast(broadcastModel, deliveryModel, broadcast._id.toString()),
    ).rejects.toThrow('Уже отправлено. Отменить нечего.');
    await expect(broadcastModel.findById(broadcast._id).lean()).resolves.toMatchObject({
      status: 'sent',
    });
  });

  it('failed → 409 «Рассылка не удалась — отменять нечего. Создайте новую.»', async () => {
    const broadcast = await seedBroadcast('failed');

    await expect(
      cancelBroadcast(broadcastModel, deliveryModel, broadcast._id.toString()),
    ).rejects.toThrow('Рассылка не удалась — отменять нечего. Создайте новую.');
  });

  it('cancelled → 409 «Рассылка уже отменена.» (повторное нажатие)', async () => {
    const broadcast = await seedBroadcast('cancelled');

    await expect(
      cancelBroadcast(broadcastModel, deliveryModel, broadcast._id.toString()),
    ).rejects.toThrow('Рассылка уже отменена.');
  });

  it('несуществующую — NotFoundError', async () => {
    await expect(
      cancelBroadcast(broadcastModel, deliveryModel, '507f1f77bcf86cd799439011'),
    ).rejects.toThrow('не найдена');
  });

  it('гонка: статус сменился между чтением экрана и кликом — CAS не даёт затереть исход', async () => {
    const broadcast = await seedBroadcast('scheduled');
    // Симулируем «раннер уже отправил всё» ровно перед вызовом cancel —
    // read-then-write откатил бы это обратно в cancelled, CAS — нет.
    await broadcastModel.updateOne({ _id: broadcast._id }, { $set: { status: 'sent' } });

    await expect(
      cancelBroadcast(broadcastModel, deliveryModel, broadcast._id.toString()),
    ).rejects.toThrow('Уже отправлено. Отменить нечего.');
    await expect(broadcastModel.findById(broadcast._id).lean()).resolves.toMatchObject({
      status: 'sent',
    });
  });
});
