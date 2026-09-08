// Против настоящей Mongo (CLAUDE.md «Тесты») — условный апдейт
// teacherNotifiedAt ДО отправки, признак «автоматический плейсхолдер»
// (channelIds: []), дедуп. Тексты по причине — telegram/
// broadcast-cancel-message.spec.ts, здесь только маршрутизация к notifier'у.
import { DateTime } from 'luxon';
import { Types, type Connection, type Model } from 'mongoose';
import { claimOnce } from '../common/claim-once';
import { encryptSchemaFrom } from '../common/field-policy';
import type {
  CancelledBroadcastContext,
  TeacherNotifier,
} from '../deliveries/teacher-notifier';
import { encryptRecord } from '../utils/encryption';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { CANCEL_REASON } from './broadcast-cancel-reasons';
import {
  BROADCAST_FIELD_POLICY,
  BroadcastRecord,
  BroadcastSchema,
} from './broadcast.schema';
import { BroadcastCancelNotifyService } from './broadcast-cancel-notify.service';

const NOW = DateTime.fromISO('2026-09-06T18:00:00Z', { zone: 'utc' });
const ENCRYPT_SCHEMA = encryptSchemaFrom(BROADCAST_FIELD_POLICY);

function fakeNotifier(): { notifyBroadcastCancelled: jest.Mock } {
  return { notifyBroadcastCancelled: jest.fn().mockResolvedValue(undefined) };
}

describe('BroadcastCancelNotifyService.notifyPending', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let broadcastModel: Model<BroadcastRecord>;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    broadcastModel = connection.model<BroadcastRecord>(
      BroadcastRecord.name,
      BroadcastSchema,
    );
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  afterEach(async () => {
    await broadcastModel.deleteMany({});
  });

  async function createCancelled(overrides: Partial<BroadcastRecord> = {}) {
    return broadcastModel.create(
      encryptRecord(
        {
          kind: 'lesson_link',
          lessonId: new Types.ObjectId(),
          channelIds: [],
          scheduledAt: NOW.toJSDate(),
          text: CANCEL_REASON.noChannels,
          status: 'cancelled',
          ...overrides,
        },
        ENCRYPT_SCHEMA,
      ),
    );
  }

  it('автоматический плейсхолдер — зовёт notifier, ставит teacherNotifiedAt', async () => {
    const broadcast = await createCancelled();
    const notifier = fakeNotifier();
    const service = new BroadcastCancelNotifyService(
      broadcastModel,
      notifier as unknown as TeacherNotifier,
    );

    const result = await service.notifyPending(NOW);

    expect(result).toEqual({ claimed: 1 });
    expect(notifier.notifyBroadcastCancelled).toHaveBeenCalledTimes(1);
    const [context] = notifier.notifyBroadcastCancelled.mock.calls[0] as [
      CancelledBroadcastContext,
      DateTime,
    ];
    expect(context.broadcastId).toBe(broadcast._id.toString());
    expect(context.lessonId).toBe(broadcast.lessonId?.toString());
    expect(context.reason).toBe(CANCEL_REASON.noChannels);

    const updated = await broadcastModel.findById(broadcast._id).lean();
    expect(updated?.teacherNotifiedAt).toBeInstanceOf(Date);
  });

  it('teacherNotifiedAt уже стоит — повторно не зовёт notifier', async () => {
    await createCancelled({ teacherNotifiedAt: NOW.minus({ minutes: 1 }).toJSDate() });
    const notifier = fakeNotifier();
    const service = new BroadcastCancelNotifyService(
      broadcastModel,
      notifier as unknown as TeacherNotifier,
    );

    const result = await service.notifyPending(NOW);

    expect(result).toEqual({ claimed: 0 });
    expect(notifier.notifyBroadcastCancelled).not.toHaveBeenCalled();
  });

  it('ручная отмена учителем (channelIds непустой) — не трогаем: учитель и так знает', async () => {
    await createCancelled({ channelIds: [new Types.ObjectId()] });
    const notifier = fakeNotifier();
    const service = new BroadcastCancelNotifyService(
      broadcastModel,
      notifier as unknown as TeacherNotifier,
    );

    const result = await service.notifyPending(NOW);

    expect(result).toEqual({ claimed: 0 });
    expect(notifier.notifyBroadcastCancelled).not.toHaveBeenCalled();
  });

  it('рассылка ещё scheduled/sent — не трогаем', async () => {
    await createCancelled({ status: 'scheduled' });
    await createCancelled({ status: 'sent' });
    const notifier = fakeNotifier();
    const service = new BroadcastCancelNotifyService(
      broadcastModel,
      notifier as unknown as TeacherNotifier,
    );

    const result = await service.notifyPending(NOW);

    expect(result).toEqual({ claimed: 0 });
  });

  it('teacherNotifiedAt заняли между выборкой и захватом (гонка) — вторая попытка пропускает', async () => {
    const broadcast = await createCancelled();
    await broadcastModel.updateOne(
      { _id: broadcast._id },
      { $set: { teacherNotifiedAt: NOW.toJSDate() } },
    );

    await expect(
      claimOnce(broadcastModel, broadcast._id, 'teacherNotifiedAt', NOW),
    ).resolves.toBe(false);
  });

  it('несколько due рассылок — все обработаны', async () => {
    await createCancelled();
    await createCancelled({ lessonId: new Types.ObjectId(), text: CANCEL_REASON.noLink });
    const notifier = fakeNotifier();
    const service = new BroadcastCancelNotifyService(
      broadcastModel,
      notifier as unknown as TeacherNotifier,
    );

    const result = await service.notifyPending(NOW);

    expect(result).toEqual({ claimed: 2 });
    expect(notifier.notifyBroadcastCancelled).toHaveBeenCalledTimes(2);
  });

  it('notifier бросает — не мешает: ошибку ловит вызывающий шаг тика (scheduler.service.ts)', async () => {
    await createCancelled();
    const notifier = {
      notifyBroadcastCancelled: jest.fn().mockRejectedValue(new Error('бот молчит')),
    };
    const service = new BroadcastCancelNotifyService(
      broadcastModel,
      notifier as unknown as TeacherNotifier,
    );

    await expect(service.notifyPending(NOW)).rejects.toThrow('бот молчит');
  });
});
