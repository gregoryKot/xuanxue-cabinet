// Против настоящей Mongo (CLAUDE.md «Тесты»): read-after-write — пишем в
// одном месте (broadcast/delivery напрямую в базу), считаем сводкой. Логика
// «пока нечего показать» и период — summary.format.spec.ts, здесь только
// то, что сервис реально находит в базе.
import { DateTime } from 'luxon';
import { Types, type Connection, type Model } from 'mongoose';
import { BroadcastRecord, BroadcastSchema } from '../broadcasts/broadcast.schema';
import { ChannelRecord, ChannelSchema } from '../channels/channel.schema';
import { ClassRecord, ClassSchema } from '../classes/class.schema';
import { DeliveryRecord, DeliverySchema } from '../deliveries/delivery.schema';
import { LessonRecord, LessonSchema } from '../lessons/lesson.schema';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { SummaryService } from './summary.service';

const NOW = DateTime.fromISO('2026-09-06T18:00:00Z', { zone: 'utc' });

describe('SummaryService.get', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let broadcastModel: Model<BroadcastRecord>;
  let deliveryModel: Model<DeliveryRecord>;
  let channelModel: Model<ChannelRecord>;
  let lessonModel: Model<LessonRecord>;
  let classModel: Model<ClassRecord>;
  let service: SummaryService;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    broadcastModel = connection.model<BroadcastRecord>(
      BroadcastRecord.name,
      BroadcastSchema,
    );
    deliveryModel = connection.model<DeliveryRecord>(DeliveryRecord.name, DeliverySchema);
    channelModel = connection.model<ChannelRecord>(ChannelRecord.name, ChannelSchema);
    lessonModel = connection.model<LessonRecord>(LessonRecord.name, LessonSchema);
    classModel = connection.model<ClassRecord>(ClassRecord.name, ClassSchema);
    service = new SummaryService(
      broadcastModel,
      deliveryModel,
      channelModel,
      lessonModel,
      classModel,
    );
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  afterEach(async () => {
    await Promise.all([
      broadcastModel.deleteMany({}),
      deliveryModel.deleteMany({}),
      channelModel.deleteMany({}),
      lessonModel.deleteMany({}),
      classModel.deleteMany({}),
    ]);
  });

  /** `timestamps: true` ставит `createdAt` по настоящим часам процесса и не
   * даёт переписать его через Model.updateMany (плагин timestamps защищает
   * поле от `$set`) — счётчики failed/pending/manualWaiting смотрят именно
   * на него, поэтому в тестах с фиксированным NOW его нужно переставить в
   * обход Mongoose, сырым драйвером (CLAUDE.md «Детерминизм»). */
  async function withinWindow(ids: (Types.ObjectId | undefined)[]) {
    await deliveryModel.collection.updateMany(
      { _id: { $in: ids.filter((id): id is Types.ObjectId => id !== undefined) } },
      { $set: { createdAt: NOW.toJSDate() } },
    );
  }

  it('пустая база — emptyMessage', async () => {
    const result = await service.get(NOW);

    expect(result.emptyMessage).toBe(
      'Пока нечего показать: ни одной рассылки за 30 дней. Ближайших занятий не запланировано.',
    );
  });

  it('одна sent-доставка за период — broadcastsSent = 1', async () => {
    const broadcast = await broadcastModel.create({
      kind: 'manual',
      channelIds: [],
      scheduledAt: NOW.minus({ days: 1 }).toJSDate(),
      sentAt: NOW.minus({ days: 1 }).toJSDate(),
      text: 'x',
      status: 'sent',
    });
    await deliveryModel.create({
      broadcastId: broadcast._id,
      channelId: broadcast._id, // канал не важен для этого счётчика
      status: 'sent',
    });

    const result = await service.get(NOW);

    expect(result.broadcastsSent).toBe(1);
    expect(result.emptyMessage).toBeUndefined();
  });

  it('sent за пределами периода (31 день назад) — не считается', async () => {
    await broadcastModel.create({
      kind: 'manual',
      channelIds: [],
      scheduledAt: NOW.minus({ days: 31 }).toJSDate(),
      sentAt: NOW.minus({ days: 31 }).toJSDate(),
      text: 'x',
      status: 'sent',
    });

    const result = await service.get(NOW);

    expect(result.broadcastsSent).toBe(0);
  });

  it('failed/pending доставки — свои счётчики', async () => {
    const broadcast = await broadcastModel.create({
      kind: 'manual',
      channelIds: [],
      scheduledAt: NOW.toJSDate(),
      text: 'x',
      status: 'scheduled',
    });
    const [failed, pending] = await deliveryModel.create([
      { broadcastId: broadcast._id, channelId: new Types.ObjectId(), status: 'failed' },
      { broadcastId: broadcast._id, channelId: new Types.ObjectId(), status: 'pending' },
    ]);
    // timestamps:true ставит createdAt по настоящим часам процесса, не по
    // NOW теста — переставляем в окно вручную (CLAUDE.md «Детерминизм»,
    // тот же приём, что в deliveries.e2e-spec.ts).
    await withinWindow([failed?._id, pending?._id]);

    const result = await service.get(NOW);

    expect(result.deliveriesFailed).toBe(1);
    expect(result.deliveriesPending).toBe(1);
  });

  it('manualWaiting — только доставки в ручной канал, pending и manual', async () => {
    const manualChannel = await channelModel.create({
      type: 'manual',
      title: 'Boosty',
      config: '{}',
      target: '',
      active: true,
    });
    const telegramChannel = await channelModel.create({
      type: 'telegram',
      title: 'Канал школы',
      config: '{}',
      target: '@school',
      active: true,
    });
    const broadcast = await broadcastModel.create({
      kind: 'manual',
      channelIds: [manualChannel._id, telegramChannel._id],
      scheduledAt: NOW.toJSDate(),
      text: 'x',
      status: 'scheduled',
    });
    const [manual, telegram] = await deliveryModel.create([
      { broadcastId: broadcast._id, channelId: manualChannel._id, status: 'manual' },
      { broadcastId: broadcast._id, channelId: telegramChannel._id, status: 'pending' },
    ]);
    await withinWindow([manual?._id, telegram?._id]);

    const result = await service.get(NOW);

    expect(result.manualWaiting).toBe(1);
  });

  it('nextLesson — ближайшее scheduled занятие впереди, с названием класса', async () => {
    const cls = await classModel.create({
      title: 'Цигун для глаз',
      groupLabel: '',
      format: 'online',
      tz: 'Asia/Jerusalem',
      leadMinutes: 30,
      active: true,
      channelIds: [],
    });
    const soon = await lessonModel.create({
      classId: cls._id,
      startsAt: NOW.plus({ hours: 1 }).toJSDate(),
      durationMin: 60,
      status: 'scheduled',
    });
    await lessonModel.create({
      classId: cls._id,
      startsAt: NOW.plus({ hours: 2 }).toJSDate(),
      durationMin: 60,
      status: 'scheduled',
    });

    const result = await service.get(NOW);

    expect(result.nextLesson).toEqual({
      lessonId: soon._id.toString(),
      title: 'Цигун для глаз',
      startsAt: soon.startsAt.toISOString(),
    });
  });

  it('nextLesson: класс занятия пропал из базы — nextLesson не отдаётся, не падает', async () => {
    await lessonModel.create({
      classId: new Types.ObjectId(),
      startsAt: NOW.plus({ hours: 1 }).toJSDate(),
      durationMin: 60,
      status: 'scheduled',
    });

    const result = await service.get(NOW);

    expect(result.nextLesson).toBeUndefined();
  });

  it('нет ни рассылок, ни занятий — emptyMessage; отменённое занятие в счёт не идёт', async () => {
    const cls = await classModel.create({
      title: 'Цигун для глаз',
      groupLabel: '',
      format: 'online',
      tz: 'Asia/Jerusalem',
      leadMinutes: 30,
      active: true,
      channelIds: [],
    });
    await lessonModel.create({
      classId: cls._id,
      startsAt: NOW.plus({ hours: 1 }).toJSDate(),
      durationMin: 60,
      status: 'cancelled',
    });

    const result = await service.get(NOW);

    expect(result.nextLesson).toBeUndefined();
    expect(result.emptyMessage).toBeDefined();
  });
});
