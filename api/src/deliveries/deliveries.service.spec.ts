// Против настоящей Mongo (CLAUDE.md «Тесты» — не мок модели): text только у
// ручного канала, mark-sent меняет статус и пересчитывает broadcast.
import { DateTime } from 'luxon';
import type { Connection, Model } from 'mongoose';
import type { DeliveryStatus } from '@xuanxue/shared';
import { encryptSchemaFrom } from '../common/field-policy';
import { encrypt, encryptRecord } from '../utils/encryption';
import {
  BROADCAST_FIELD_POLICY,
  BroadcastRecord,
  BroadcastSchema,
} from '../broadcasts/broadcast.schema';
import { ChannelRecord, ChannelSchema } from '../channels/channel.schema';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { DeliveriesService } from './deliveries.service';
import { DeliveryRecord, DeliverySchema } from './delivery.schema';

const NOW = DateTime.fromISO('2026-09-06T18:00:00Z', { zone: 'utc' });
const BROADCAST_ENCRYPT_SCHEMA = encryptSchemaFrom(BROADCAST_FIELD_POLICY);

describe('DeliveriesService', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let deliveryModel: Model<DeliveryRecord>;
  let broadcastModel: Model<BroadcastRecord>;
  let channelModel: Model<ChannelRecord>;
  let service: DeliveriesService;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    deliveryModel = connection.model<DeliveryRecord>(DeliveryRecord.name, DeliverySchema);
    broadcastModel = connection.model<BroadcastRecord>(
      BroadcastRecord.name,
      BroadcastSchema,
    );
    channelModel = connection.model<ChannelRecord>(ChannelRecord.name, ChannelSchema);
    service = new DeliveriesService(deliveryModel, broadcastModel, channelModel);
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  afterEach(async () => {
    await Promise.all([
      deliveryModel.deleteMany({}),
      broadcastModel.deleteMany({}),
      channelModel.deleteMany({}),
    ]);
  });

  async function seed(
    channelType: 'manual' | 'telegram',
    deliveryStatus: DeliveryStatus,
  ) {
    const channel = await channelModel.create({
      type: channelType,
      title: channelType === 'manual' ? 'Boosty' : 'Канал школы',
      config: '{}',
      target: '',
      active: true,
    });
    const broadcast = await broadcastModel.create(
      encryptRecord(
        {
          kind: 'manual',
          channelIds: [channel._id],
          scheduledAt: NOW.toJSDate(),
          text: 'Текст рассылки',
          status: 'scheduled',
        },
        BROADCAST_ENCRYPT_SCHEMA,
      ),
    );
    const delivery = await deliveryModel.create({
      broadcastId: broadcast._id,
      channelId: channel._id,
      status: deliveryStatus,
    });
    return { channel, broadcast, delivery };
  }

  it('getById: у manual-канала — text с расшифрованным содержимым', async () => {
    const { delivery } = await seed('manual', 'manual');

    const dto = await service.getById(delivery._id.toString());

    expect(dto.text).toBe('Текст рассылки');
  });

  it('getById: manual-канал, но рассылка уже удалена — text отсутствует, не падает', async () => {
    const { delivery, broadcast } = await seed('manual', 'manual');
    await broadcastModel.deleteOne({ _id: broadcast._id });

    const dto = await service.getById(delivery._id.toString());

    expect(dto.text).toBeUndefined();
  });

  it('getById: у telegram-канала — text отсутствует', async () => {
    const { delivery } = await seed('telegram', 'pending');

    const dto = await service.getById(delivery._id.toString());

    expect(dto.text).toBeUndefined();
  });

  it('getById: несуществующий id — NotFoundError', async () => {
    await expect(service.getById('507f1f77bcf86cd799439011')).rejects.toThrow(
      'не найдена',
    );
  });

  it('markSent: manual-канал, статус manual → sent, sentAt проставлен, broadcast пересчитан в sent', async () => {
    const { delivery, broadcast } = await seed('manual', 'manual');

    const dto = await service.markSent(delivery._id.toString(), NOW);

    expect(dto.status).toBe('sent');
    expect(dto.sentAt).toBe(NOW.toISO());
    const storedBroadcast = await broadcastModel.findById(broadcast._id).lean();
    expect(storedBroadcast?.status).toBe('sent');
  });

  it('markSent: manual-канал, статус pending (учитель успел раньше тика) → тоже sent', async () => {
    const { delivery } = await seed('manual', 'pending');

    const dto = await service.markSent(delivery._id.toString(), NOW);

    expect(dto.status).toBe('sent');
  });

  it('markSent: уже sent (решение по modifiedCount, двойной клик) — ConflictError «Уже отправлено.»', async () => {
    const { delivery } = await seed('manual', 'sent');

    await expect(service.markSent(delivery._id.toString(), NOW)).rejects.toThrow(
      'Уже отправлено',
    );
  });

  it('markSent: telegram-доставка (не manual канал) — ConflictError «уходит сама»', async () => {
    const { delivery } = await seed('telegram', 'pending');

    await expect(service.markSent(delivery._id.toString(), NOW)).rejects.toThrow(
      'уходит сама',
    );
  });

  it('markSent: рассылку отменили между отправкой в канал и нажатием — «Рассылка отменена»', async () => {
    const { delivery } = await seed('manual', 'cancelled');

    await expect(service.markSent(delivery._id.toString(), NOW)).rejects.toThrow(
      'Рассылка отменена, отправлять не нужно.',
    );
  });

  it('markSent: несуществующий id — NotFoundError, текст ведёт в журнал рассылок (второй потребитель — бот)', async () => {
    await expect(service.markSent('507f1f77bcf86cd799439011', NOW)).rejects.toThrow(
      'Доставка не найдена. Откройте журнал рассылок.',
    );
  });

  it('getById: error расшифрован (read-after-write через сырую запись с шифротекстом)', async () => {
    const { delivery } = await seed('telegram', 'pending');
    await deliveryModel.updateOne(
      { _id: delivery._id },
      { $set: { status: 'failed', error: encrypt('Чат не найден') } },
    );

    const dto = await service.getById(delivery._id.toString());

    expect(dto.error).toBe('Чат не найден');
    const raw = await deliveryModel.findById(delivery._id).lean();
    expect(raw?.error).not.toBe('Чат не найден');
  });

  describe('list — экран «проблемы»', () => {
    it('без status — все доставки, свежие сверху', async () => {
      const first = await seed('manual', 'sent');
      const second = await seed('telegram', 'failed');
      // createdAt различаются явно — порядок не должен зависеть от
      // случайного зазора между двумя create() в одном тике (CLAUDE.md
      // «Детерминизм»).
      await deliveryModel.updateOne(
        { _id: first.delivery._id },
        { $set: { createdAt: NOW.minus({ minutes: 1 }).toJSDate() } },
      );
      await deliveryModel.updateOne(
        { _id: second.delivery._id },
        { $set: { createdAt: NOW.toJSDate() } },
      );

      const found = await service.list({});

      expect(found.map((d) => d.id)).toEqual([
        second.delivery._id.toString(),
        first.delivery._id.toString(),
      ]);
    });

    it('status сужает список', async () => {
      await seed('manual', 'sent');
      const failed = await seed('telegram', 'failed');

      const found = await service.list({ status: 'failed' });

      expect(found).toHaveLength(1);
      expect(found[0]?.id).toBe(failed.delivery._id.toString());
    });

    it('limit ограничивает выдачу', async () => {
      await seed('manual', 'pending');
      await seed('manual', 'pending');

      const found = await service.list({ limit: 1 });

      expect(found).toHaveLength(1);
    });
  });
});
