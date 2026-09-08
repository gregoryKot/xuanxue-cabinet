// Против настоящей Mongo (CLAUDE.md «Тесты» — не мок модели): выборка
// активных каналов, шифрование текста, cancelled-плейсхолдер при пустом
// классе/канале — тем же путём, что у BroadcastPlannerService
// (broadcast-planner.service.spec.ts), но kind: 'recording' и
// идемпотентность на уникальном индексе (lessonId, recordingKey), не на
// частичном (lessonId, kind), как у lesson_link.
import { DateTime } from 'luxon';
import type { Connection, Model, Types } from 'mongoose';
import { ChannelRecord, ChannelSchema } from '../channels/channel.schema';
import { ClassRecord, ClassSchema } from '../classes/class.schema';
import { LessonRecord, LessonSchema } from '../lessons/lesson.schema';
import { DeliveryRecord, DeliverySchema } from '../deliveries/delivery.schema';
import { SettingsRecord, SettingsSchema } from '../settings/settings.schema';
import { SettingsService } from '../settings/settings.service';
import { UserRecord, UserSchema } from '../users/user.schema';
import { UsersService } from '../users/users.service';
import { decrypt } from '../utils/encryption';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { BroadcastModels } from './broadcast-models.provider';
import { BroadcastRecord, BroadcastSchema } from './broadcast.schema';
import { RecordingBroadcastService } from './recording-broadcast.service';

const NOW = DateTime.fromISO('2026-09-06T18:00:00Z', { zone: 'utc' });
const RECORDING = { title: 'Занятие 5', url: 'https://drive.example/rec' };

describe('RecordingBroadcastService.ensureForRecording', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let classModel: Model<ClassRecord>;
  let lessonModel: Model<LessonRecord>;
  let broadcastModel: Model<BroadcastRecord>;
  let deliveryModel: Model<DeliveryRecord>;
  let channelModel: Model<ChannelRecord>;
  let service: RecordingBroadcastService;

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
    const userModel = connection.model<UserRecord>(UserRecord.name, UserSchema);
    const settingsModel = connection.model<SettingsRecord>(
      SettingsRecord.name,
      SettingsSchema,
    );
    const usersService = new UsersService(userModel);
    const models = new BroadcastModels(
      lessonModel,
      classModel,
      channelModel,
      broadcastModel,
      deliveryModel,
    );
    service = new RecordingBroadcastService(
      models,
      new SettingsService(settingsModel, lessonModel, classModel, usersService),
      usersService,
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
      connection.model(SettingsRecord.name).deleteMany({}),
    ]);
  });

  async function createChannel(active = true) {
    return channelModel.create({
      type: 'telegram',
      title: 'Канал школы',
      config: '{}',
      target: '',
      active,
    });
  }

  async function createClass(overrides: Partial<ClassRecord> = {}) {
    const channelIds = overrides.channelIds ?? [(await createChannel())._id];
    return classModel.create({
      title: 'цигун для глаз',
      format: 'online',
      tz: 'Asia/Jerusalem',
      leadMinutes: 30,
      active: true,
      ...overrides,
      channelIds,
    });
  }

  async function createLesson(classId: Types.ObjectId) {
    return lessonModel.create({
      classId,
      startsAt: NOW.minus({ hours: 1 }).toJSDate(),
      durationMin: 60,
      status: 'scheduled',
      topic: 'Пятое занятие',
    });
  }

  it('создаёт рассылку записи и доставку, текст зашифрован, recordingKey — url', async () => {
    const cls = await createClass();
    const lesson = await createLesson(cls._id);

    await service.ensureForRecording(lesson._id, RECORDING, NOW);

    const broadcast = await broadcastModel.findOne({ lessonId: lesson._id }).lean();
    expect(broadcast?.kind).toBe('recording');
    expect(broadcast?.status).toBe('scheduled');
    expect(broadcast?.recordingKey).toBe(RECORDING.url);
    expect(broadcast?.text).not.toContain(RECORDING.url); // зашифровано
    expect(decrypt(broadcast?.text)).toContain(RECORDING.url);

    const deliveries = await deliveryModel.find({ broadcastId: broadcast?._id }).lean();
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]?.status).toBe('pending');
  });

  it('только видеофайл (без url) — recordingKey по telegramFileId', async () => {
    const cls = await createClass();
    const lesson = await createLesson(cls._id);

    await service.ensureForRecording(
      lesson._id,
      { title: 'Видео', telegramFileId: 'BAADBAADrwADBREAAYag' },
      NOW,
    );

    const broadcast = await broadcastModel.findOne({ lessonId: lesson._id }).lean();
    expect(broadcast?.recordingKey).toBe('BAADBAADrwADBREAAYag');
    expect(broadcast?.telegramFileId).toBe('BAADBAADrwADBREAAYag');
  });

  it('повтор с тем же url — одна рассылка, доставки не дублируются', async () => {
    const cls = await createClass();
    const lesson = await createLesson(cls._id);

    await service.ensureForRecording(lesson._id, RECORDING, NOW);
    await service.ensureForRecording(lesson._id, RECORDING, NOW);

    await expect(
      broadcastModel.countDocuments({ lessonId: lesson._id, kind: 'recording' }),
    ).resolves.toBe(1);
    await expect(deliveryModel.countDocuments({})).resolves.toBe(1);
  });

  it('broadcast есть, доставок нет (первый вызов упал между insert-ами) — повтор их досоздаёт', async () => {
    const cls = await createClass();
    const lesson = await createLesson(cls._id);
    await broadcastModel.create({
      kind: 'recording',
      lessonId: lesson._id,
      recordingKey: RECORDING.url,
      channelIds: cls.channelIds,
      scheduledAt: NOW.toJSDate(),
      text: 'x',
      status: 'scheduled',
    });
    await expect(deliveryModel.countDocuments({})).resolves.toBe(0);

    await service.ensureForRecording(lesson._id, RECORDING, NOW);

    await expect(
      broadcastModel.countDocuments({ lessonId: lesson._id, kind: 'recording' }),
    ).resolves.toBe(1);
    await expect(deliveryModel.countDocuments({})).resolves.toBe(1);
  });

  it('разные url на одно занятие — две отдельные рассылки записи', async () => {
    const cls = await createClass();
    const lesson = await createLesson(cls._id);

    await service.ensureForRecording(lesson._id, RECORDING, NOW);
    await service.ensureForRecording(
      lesson._id,
      { title: 'Вторая запись', url: 'https://drive.example/rec-2' },
      NOW,
    );

    await expect(
      broadcastModel.countDocuments({ lessonId: lesson._id, kind: 'recording' }),
    ).resolves.toBe(2);
  });

  it('все каналы класса выключены — cancelled-плейсхолдер с recordingKey, доставок нет', async () => {
    const offChannel = await createChannel(false);
    const cls = await createClass({ channelIds: [offChannel._id] });
    const lesson = await createLesson(cls._id);

    await service.ensureForRecording(lesson._id, RECORDING, NOW);

    const broadcast = await broadcastModel.findOne({ lessonId: lesson._id }).lean();
    expect(broadcast?.status).toBe('cancelled');
    expect(broadcast?.recordingKey).toBe(RECORDING.url);
    expect(decrypt(broadcast?.text)).toBe('все каналы класса выключены');
    await expect(deliveryModel.countDocuments({})).resolves.toBe(0);
  });

  it('класс выключен — cancelled-плейсхолдер с причиной', async () => {
    const cls = await createClass({ active: false });
    const lesson = await createLesson(cls._id);

    await service.ensureForRecording(lesson._id, RECORDING, NOW);

    const broadcast = await broadcastModel.findOne({ lessonId: lesson._id }).lean();
    expect(decrypt(broadcast?.text)).toBe('класс выключен');
  });

  it('класса нет в базе — cancelled-плейсхолдер', async () => {
    const cls = await createClass();
    const lesson = await createLesson(cls._id);
    await classModel.deleteOne({ _id: cls._id });

    await service.ensureForRecording(lesson._id, RECORDING, NOW);

    const broadcast = await broadcastModel.findOne({ lessonId: lesson._id }).lean();
    expect(decrypt(broadcast?.text)).toBe('занятие без класса в базе');
  });

  it('занятие удалено между $push и вызовом — ничего не создаёт, не падает', async () => {
    const cls = await createClass();
    const lesson = await createLesson(cls._id);
    const lessonId = lesson._id;
    await lessonModel.deleteOne({ _id: lessonId });

    await expect(
      service.ensureForRecording(lessonId, RECORDING, NOW),
    ).resolves.toBeUndefined();
    await expect(broadcastModel.countDocuments({})).resolves.toBe(0);
  });

  it('неожиданный сбой (класс — сломанные данные) — тихого отказа нет: cancelled-плейсхолдер с причиной, не падает', async () => {
    const cls = await createClass();
    const lesson = await createLesson(cls._id);
    // Ломаем документ класса так, чтобы findClassForRecording упал не на
    // штатной ветке (не «класса нет»/«выключен»), а на самом чтении —
    // channelIds не ObjectId вызывает CastError у Mongoose.
    await classModel.collection.updateOne(
      { _id: cls._id },
      { $set: { channelIds: ['не-ObjectId'] } },
    );

    await expect(
      service.ensureForRecording(lesson._id, RECORDING, NOW),
    ).resolves.toBeUndefined(); // не пробрасывает — запись уже сохранена

    const broadcast = await broadcastModel.findOne({ lessonId: lesson._id }).lean();
    expect(broadcast?.status).toBe('cancelled');
    expect(decrypt(broadcast?.text)).toContain('рассылка записи не создалась');
  });
});
