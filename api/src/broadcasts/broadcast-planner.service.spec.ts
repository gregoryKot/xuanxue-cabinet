// Против настоящей Mongo (CLAUDE.md «Тесты» — не мок модели): индексы,
// идемпотентность, шифрование текста рассылки, выборка активных каналов
// читаются по-настоящему.
import { DateTime } from 'luxon';
import mongoose, { type Connection, type Model, type Types } from 'mongoose';
import { ChannelRecord, ChannelSchema } from '../channels/channel.schema';
import { ClassRecord, ClassSchema } from '../classes/class.schema';
import { LessonRecord, LessonSchema } from '../lessons/lesson.schema';
import { DeliveryRecord, DeliverySchema } from '../deliveries/delivery.schema';
import { SettingsRecord, SettingsSchema } from '../settings/settings.schema';
import { SettingsService } from '../settings/settings.service';
import { UserRecord, UserSchema } from '../users/user.schema';
import { UsersService } from '../users/users.service';
import { BroadcastRecord, BroadcastSchema } from './broadcast.schema';
import { BroadcastPlannerService } from './broadcast-planner.service';
import { decrypt } from '../utils/encryption';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';

const NOW = DateTime.fromISO('2026-09-06T18:00:00Z', { zone: 'utc' });

describe('BroadcastPlannerService.plan', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let classModel: Model<ClassRecord>;
  let lessonModel: Model<LessonRecord>;
  let broadcastModel: Model<BroadcastRecord>;
  let deliveryModel: Model<DeliveryRecord>;
  let channelModel: Model<ChannelRecord>;
  let userModel: Model<UserRecord>;
  let service: BroadcastPlannerService;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    classModel = connection.model<ClassRecord>(ClassRecord.name, ClassSchema);
    lessonModel = connection.model<LessonRecord>(LessonRecord.name, LessonSchema);
    broadcastModel = connection.model<BroadcastRecord>(
      BroadcastRecord.name,
      BroadcastSchema,
    );
    deliveryModel = connection.model<DeliveryRecord>(DeliveryRecord.name, DeliverySchema);
    channelModel = connection.model<ChannelRecord>(ChannelRecord.name, ChannelSchema);
    userModel = connection.model<UserRecord>(UserRecord.name, UserSchema);
    const settingsModel = connection.model<SettingsRecord>(
      SettingsRecord.name,
      SettingsSchema,
    );
    service = new BroadcastPlannerService(
      classModel,
      lessonModel,
      broadcastModel,
      deliveryModel,
      channelModel,
      new SettingsService(settingsModel),
      new UsersService(userModel),
    );
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  afterEach(async () => {
    await Promise.all([
      classModel.deleteMany({}),
      lessonModel.deleteMany({}),
      broadcastModel.deleteMany({}),
      deliveryModel.deleteMany({}),
      channelModel.deleteMany({}),
      userModel.deleteMany({}),
      connection.model(SettingsRecord.name).deleteMany({}),
    ]);
  });

  /** Активный telegram-канал — по умолчанию у класса есть хотя бы один такой
   * (findActiveChannelIds иначе не находит ничего и рассылка не создаётся). */
  async function createChannel(overrides: Partial<ChannelRecord> = {}) {
    return channelModel.create({
      type: 'telegram',
      title: 'Канал школы',
      config: '{}',
      target: '',
      active: true,
      ...overrides,
    });
  }

  async function createClass(overrides: Partial<ClassRecord> = {}) {
    const channelIds = overrides.channelIds ?? [(await createChannel())._id];
    return classModel.create({
      title: 'цигун для глаз',
      groupLabel: '',
      format: 'online',
      zoomLink: 'https://zoom.example/1',
      tz: 'Asia/Jerusalem',
      leadMinutes: 30,
      active: true,
      ...overrides,
      channelIds,
    });
  }

  async function createLesson(
    classId: Types.ObjectId,
    startsAt: Date,
    overrides: Partial<LessonRecord> = {},
  ) {
    return lessonModel.create({
      classId,
      startsAt,
      durationMin: 60,
      status: 'scheduled',
      ...overrides,
    });
  }

  it('создаёт рассылку и доставки для занятия в окне, текст зашифрован', async () => {
    const cls = await createClass();
    const lesson = await createLesson(cls._id, NOW.plus({ minutes: 10 }).toJSDate());

    const result = await service.plan(NOW);

    expect(result).toEqual({ broadcasts: 1 });
    const broadcasts = await broadcastModel.find({ lessonId: lesson._id }).lean();
    expect(broadcasts).toHaveLength(1);
    expect(broadcasts[0]?.status).toBe('scheduled');
    expect(broadcasts[0]?.text).not.toContain('https://zoom.example/1'); // зашифровано
    expect(decrypt(broadcasts[0]?.text)).toContain('https://zoom.example/1');

    const deliveries = await deliveryModel
      .find({ broadcastId: broadcasts[0]?._id })
      .lean();
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]?.status).toBe('pending');
    expect(deliveries[0]?.channelId.toString()).toBe(cls.channelIds[0]?.toString());
  });

  it('broadcast есть, а доставок нет (первый тик упал между insert-ами) — второй тик их досоздаёт', async () => {
    const cls = await createClass();
    const lesson = await createLesson(cls._id, NOW.plus({ minutes: 10 }).toJSDate());
    // Симулируем «первый тик успел создать только broadcast»: insert напрямую,
    // без deliveries — insertBroadcastWithDeliveries на дубле должен найти
    // этот документ и достроить недостающие доставки, а не пропустить их.
    await broadcastModel.create({
      kind: 'lesson_link',
      lessonId: lesson._id,
      channelIds: cls.channelIds,
      scheduledAt: NOW.toJSDate(),
      text: 'x',
      status: 'scheduled',
    });
    await expect(deliveryModel.countDocuments({})).resolves.toBe(0);

    const result = await service.plan(NOW);

    expect(result).toEqual({ broadcasts: 0 }); // broadcast не новый — счётчик не растёт
    await expect(broadcastModel.countDocuments({ lessonId: lesson._id })).resolves.toBe(
      1,
    );
    await expect(deliveryModel.countDocuments({})).resolves.toBe(1);
  });

  it('второй тик не создаёт вторую рассылку и вторые доставки', async () => {
    const cls = await createClass();
    await createLesson(cls._id, NOW.plus({ minutes: 10 }).toJSDate());

    await service.plan(NOW);
    const second = await service.plan(NOW.plus({ minutes: 1 }));

    expect(second).toEqual({ broadcasts: 0 });
    await expect(broadcastModel.countDocuments({})).resolves.toBe(1);
    await expect(deliveryModel.countDocuments({})).resolves.toBe(1);
  });

  it('выключенный класс — cancelled-плейсхолдер с причиной, без доставок', async () => {
    const cls = await createClass({ active: false });
    const lesson = await createLesson(cls._id, NOW.plus({ minutes: 10 }).toJSDate());

    const result = await service.plan(NOW);

    expect(result).toEqual({ broadcasts: 0 });
    const broadcast = await broadcastModel.findOne({ lessonId: lesson._id }).lean();
    expect(broadcast?.status).toBe('cancelled');
    expect(decrypt(broadcast?.text)).toBe('класс выключен');
    await expect(deliveryModel.countDocuments({})).resolves.toBe(0);
  });

  it('занятие без класса в базе — cancelled-плейсхолдер', async () => {
    const lesson = await createLesson(
      new mongoose.Types.ObjectId(),
      NOW.plus({ minutes: 10 }).toJSDate(),
    );

    await service.plan(NOW);

    const broadcast = await broadcastModel.findOne({ lessonId: lesson._id }).lean();
    expect(decrypt(broadcast?.text)).toBe('занятие без класса в базе');
  });

  it('все каналы класса выключены — cancelled-плейсхолдер, доставок нет', async () => {
    const offChannel = await createChannel({ active: false });
    const cls = await createClass({ channelIds: [offChannel._id] });
    const lesson = await createLesson(cls._id, NOW.plus({ minutes: 10 }).toJSDate());

    const result = await service.plan(NOW);

    expect(result).toEqual({ broadcasts: 0 });
    const broadcast = await broadcastModel.findOne({ lessonId: lesson._id }).lean();
    expect(broadcast?.status).toBe('cancelled');
    expect(decrypt(broadcast?.text)).toBe('все каналы класса выключены');
    await expect(deliveryModel.countDocuments({})).resolves.toBe(0);
  });

  it('часть каналов класса выключена — доставка только на активные', async () => {
    const active = await createChannel();
    const off = await createChannel({ active: false });
    const cls = await createClass({ channelIds: [active._id, off._id] });
    await createLesson(cls._id, NOW.plus({ minutes: 10 }).toJSDate());

    const result = await service.plan(NOW);

    expect(result).toEqual({ broadcasts: 1 });
    const deliveries = await deliveryModel.find({}).lean();
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]?.channelId.toString()).toBe(active._id.toString());
  });

  it('занятие ещё не в окне — ничего не создаётся', async () => {
    const cls = await createClass();
    await createLesson(cls._id, NOW.plus({ hours: 3 }).toJSDate());

    const result = await service.plan(NOW);

    expect(result).toEqual({ broadcasts: 0 });
    await expect(broadcastModel.countDocuments({})).resolves.toBe(0);
  });

  it('занятие началось больше получаса назад — cancelled-плейсхолдер, не broadcast', async () => {
    const cls = await createClass();
    const lesson = await createLesson(cls._id, NOW.minus({ minutes: 40 }).toJSDate());

    const result = await service.plan(NOW);

    expect(result).toEqual({ broadcasts: 0 });
    const broadcast = await broadcastModel.findOne({ lessonId: lesson._id }).lean();
    expect(broadcast?.status).toBe('cancelled');
    expect(decrypt(broadcast?.text)).toBe(
      'тик опоздал: занятие началось больше 30 минут назад',
    );
    await expect(deliveryModel.countDocuments({})).resolves.toBe(0);
  });

  it('занятие началось больше получаса назад — второй тик молчит, второй документ не создаёт', async () => {
    const cls = await createClass();
    const lesson = await createLesson(cls._id, NOW.minus({ minutes: 40 }).toJSDate());

    await service.plan(NOW);
    const second = await service.plan(NOW.plus({ minutes: 1 }));

    expect(second).toEqual({ broadcasts: 0 });
    await expect(broadcastModel.countDocuments({ lessonId: lesson._id })).resolves.toBe(
      1,
    );
  });

  it('тик опоздал на несколько минут — досылает', async () => {
    const cls = await createClass();
    const lesson = await createLesson(cls._id, NOW.minus({ minutes: 5 }).toJSDate());

    const result = await service.plan(NOW);

    expect(result).toEqual({ broadcasts: 1 });
    await expect(broadcastModel.countDocuments({ lessonId: lesson._id })).resolves.toBe(
      1,
    );
  });

  it('{ведущий} — имя занятия приоритетнее имени класса, резолвится через UsersService', async () => {
    const lessonLeader = await userModel.create({ name: 'Мария', roles: ['teacher'] });
    const classLeader = await userModel.create({ name: 'Дмитрий', roles: ['teacher'] });
    const cls = await createClass({ leaderId: classLeader._id });
    await createLesson(cls._id, NOW.plus({ minutes: 10 }).toJSDate(), {
      leaderId: lessonLeader._id,
    });
    await connection.model(SettingsRecord.name).create({
      _id: 'school',
      templates: { lessonLink: 'ведёт {ведущий}', recording: 'запись' },
      tz: 'Asia/Jerusalem',
    });

    await service.plan(NOW);

    const broadcast = await broadcastModel.findOne({}).lean();
    expect(decrypt(broadcast?.text)).toBe('ведёт Мария');
  });
});
