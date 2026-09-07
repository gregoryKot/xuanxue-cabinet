// Против настоящей Mongo (CLAUDE.md «Тесты» — не мок модели): проверка
// активных каналов, шифрование текста, deliveries pending с nextAttemptAt.
import { DateTime } from 'luxon';
import type { Connection, Model } from 'mongoose';
import { ChannelRecord, ChannelSchema } from '../channels/channel.schema';
import { DeliveryRecord, DeliverySchema } from '../deliveries/delivery.schema';
import { decrypt } from '../utils/encryption';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { BroadcastRecord, BroadcastSchema } from './broadcast.schema';
import { BroadcastsService } from './broadcasts.service';

const NOW = DateTime.fromISO('2026-09-06T18:00:00Z', { zone: 'utc' });
const CREATED_BY = '507f1f77bcf86cd799439099';

describe('BroadcastsService', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let broadcastModel: Model<BroadcastRecord>;
  let deliveryModel: Model<DeliveryRecord>;
  let channelModel: Model<ChannelRecord>;
  let service: BroadcastsService;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    broadcastModel = connection.model<BroadcastRecord>(
      BroadcastRecord.name,
      BroadcastSchema,
    );
    deliveryModel = connection.model<DeliveryRecord>(DeliveryRecord.name, DeliverySchema);
    channelModel = connection.model<ChannelRecord>(ChannelRecord.name, ChannelSchema);
    service = new BroadcastsService(broadcastModel, deliveryModel, channelModel);
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

  async function createChannel(active = true) {
    return channelModel.create({
      type: 'manual',
      title: 'Boosty',
      config: '{}',
      target: '',
      active,
    });
  }

  it('createManual: broadcast kind manual, текст зашифрован, доставка pending', async () => {
    const channel = await createChannel();

    const dto = await service.createManual(
      { text: 'Итог месяца', channelIds: [channel._id.toString()] },
      CREATED_BY,
      NOW,
    );

    expect(dto.kind).toBe('manual');
    expect(dto.status).toBe('scheduled');
    expect(dto.text).toBe('Итог месяца');

    const raw = await broadcastModel.findById(dto.id).lean();
    expect(raw?.text).not.toBe('Итог месяца');
    expect(decrypt(raw?.text)).toBe('Итог месяца');
    expect(raw?.createdBy?.toString()).toBe(CREATED_BY);

    const deliveries = await deliveryModel.find({ broadcastId: dto.id }).lean();
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]?.status).toBe('pending');
  });

  it('createManual: scheduledAt в будущем — nextAttemptAt равен ему', async () => {
    const channel = await createChannel();
    const scheduledAt = NOW.plus({ hours: 2 });

    const dto = await service.createManual(
      {
        text: 'Через два часа',
        channelIds: [channel._id.toString()],
        scheduledAt: scheduledAt.toISO() ?? undefined,
      },
      CREATED_BY,
      NOW,
    );

    const delivery = await deliveryModel.findOne({ broadcastId: dto.id }).lean();
    expect(delivery?.nextAttemptAt?.toISOString()).toBe(
      scheduledAt.toJSDate().toISOString(),
    );
  });

  it('createManual: несуществующий канал — InvalidInputError «удалён», без записи в базу', async () => {
    await expect(
      service.createManual(
        { text: 'x', channelIds: ['507f1f77bcf86cd799439011'] },
        CREATED_BY,
        NOW,
      ),
    ).rejects.toThrow('удалён');
    await expect(broadcastModel.countDocuments({})).resolves.toBe(0);
  });

  it('createManual: выключенный канал — InvalidInputError с его title', async () => {
    const off = await createChannel(false);

    await expect(
      service.createManual(
        { text: 'x', channelIds: [off._id.toString()] },
        CREATED_BY,
        NOW,
      ),
    ).rejects.toThrow('Boosty');
  });

  it('createManual: дубль channelIds во входе — доставка одна, не 500 (DTO уже не должен пропускать, но сервис терпит)', async () => {
    const channel = await createChannel();

    const dto = await service.createManual(
      { text: 'x', channelIds: [channel._id.toString(), channel._id.toString()] },
      CREATED_BY,
      NOW,
    );

    const deliveries = await deliveryModel.find({ broadcastId: dto.id }).lean();
    expect(deliveries).toHaveLength(1);
  });

  it('createManual: повторный вызов с теми же данными создаёт вторую рассылку (естественного ключа у manual нет)', async () => {
    const channel = await createChannel();
    const input = { text: 'Итог месяца', channelIds: [channel._id.toString()] };

    const first = await service.createManual(input, CREATED_BY, NOW);
    const second = await service.createManual(input, CREATED_BY, NOW);

    expect(first.id).not.toBe(second.id);
    await expect(broadcastModel.countDocuments({ kind: 'manual' })).resolves.toBe(2);
  });

  it('getById: несуществующий и мусорный id — NotFoundError', async () => {
    await expect(service.getById('507f1f77bcf86cd799439011')).rejects.toThrow(
      'не найдена',
    );
    await expect(service.getById('not-an-id')).rejects.toThrow('не найдена');
  });

  describe('list — журнал', () => {
    it('окно, статус и вид сужают список; свежие сверху', async () => {
      const channel = await createChannel();
      const inWindow = await service.createManual(
        { text: 'в окне', channelIds: [channel._id.toString()] },
        CREATED_BY,
        NOW,
      );
      await service.createManual(
        { text: 'позже окна', channelIds: [channel._id.toString()] },
        CREATED_BY,
        NOW.plus({ days: 10 }),
      );
      await broadcastModel.updateOne({ _id: inWindow.id }, { $set: { status: 'sent' } });

      const found = await service.list({
        from: NOW.minus({ days: 1 }).toISO() ?? '',
        to: NOW.plus({ days: 1 }).toISO() ?? '',
      });
      expect(found).toHaveLength(1);
      expect(found[0]?.id).toBe(inWindow.id);

      const byStatus = await service.list({
        from: NOW.minus({ days: 1 }).toISO() ?? '',
        to: NOW.plus({ days: 1 }).toISO() ?? '',
        status: 'sent',
      });
      expect(byStatus).toHaveLength(1);

      const byOtherStatus = await service.list({
        from: NOW.minus({ days: 1 }).toISO() ?? '',
        to: NOW.plus({ days: 1 }).toISO() ?? '',
        status: 'failed',
      });
      expect(byOtherStatus).toHaveLength(0);
    });

    it('окно шире 8 недель — InvalidInputError', async () => {
      await expect(
        service.list({
          from: NOW.toISO() ?? '',
          to: NOW.plus({ weeks: 9 }).toISO() ?? '',
        }),
      ).rejects.toThrow('8 недел');
    });
  });

  describe('listDeliveries', () => {
    it('text только у доставки в ручной канал', async () => {
      const manual = await createChannel();
      const telegram = await channelModel.create({
        type: 'telegram',
        title: 'Канал школы',
        config: '{}',
        target: '@school',
        active: true,
      });
      const dto = await service.createManual(
        {
          text: 'Общий текст',
          channelIds: [manual._id.toString(), telegram._id.toString()],
        },
        CREATED_BY,
        NOW,
      );

      const deliveries = await service.listDeliveries(dto.id);

      expect(deliveries).toHaveLength(2);
      const manualDelivery = deliveries.find(
        (d) => d.channelId === manual._id.toString(),
      );
      const telegramDelivery = deliveries.find(
        (d) => d.channelId === telegram._id.toString(),
      );
      expect(manualDelivery?.text).toBe('Общий текст');
      expect(telegramDelivery?.text).toBeUndefined();
    });

    it('несуществующая рассылка — NotFoundError', async () => {
      await expect(service.listDeliveries('507f1f77bcf86cd799439011')).rejects.toThrow(
        'не найдена',
      );
    });

    it('рассылка есть, доставок нет — пустой список, не падает', async () => {
      const broadcast = await broadcastModel.create({
        kind: 'manual',
        channelIds: [],
        scheduledAt: NOW.toJSDate(),
        text: 'x',
        status: 'scheduled',
      });

      await expect(service.listDeliveries(broadcast._id.toString())).resolves.toEqual([]);
    });
  });

  describe('cancel', () => {
    it('scheduled → cancelled, pending-доставки тоже cancelled', async () => {
      const channel = await createChannel();
      const dto = await service.createManual(
        { text: 'x', channelIds: [channel._id.toString()] },
        CREATED_BY,
        NOW,
      );

      const cancelled = await service.cancel(dto.id);

      expect(cancelled.status).toBe('cancelled');
      const delivery = await deliveryModel.findOne({ broadcastId: dto.id }).lean();
      expect(delivery?.status).toBe('cancelled');
      expect(delivery?.lockedAt).toBeUndefined();
    });

    it('уже отправленную — ConflictError «Уже отправлено. Отменить нечего.»', async () => {
      const channel = await createChannel();
      const dto = await service.createManual(
        { text: 'x', channelIds: [channel._id.toString()] },
        CREATED_BY,
        NOW,
      );
      await broadcastModel.updateOne({ _id: dto.id }, { $set: { status: 'sent' } });

      await expect(service.cancel(dto.id)).rejects.toThrow(
        'Уже отправлено. Отменить нечего.',
      );
    });

    // Остальные исходы cancelBroadcast (manual/sending-доставки, тексты для
    // failed/cancelled, гонка со scheduled) — broadcast-journal.queries.spec.ts,
    // ближе к самой атомарной записи, без обвязки createManual.
    it('несуществующую — NotFoundError', async () => {
      await expect(service.cancel('507f1f77bcf86cd799439011')).rejects.toThrow(
        'не найдена',
      );
    });
  });
});
