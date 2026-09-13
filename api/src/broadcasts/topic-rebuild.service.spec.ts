// Против настоящей Mongo (CLAUDE.md «Тесты») — шифрование текста рассылки,
// чтение занятия/класса, пересборка по актуальному шаблону.
import { DateTime } from 'luxon';
import { Types, type Connection, type Model } from 'mongoose';
import { CLASS_ENCRYPT_SCHEMA, ClassRecord, ClassSchema } from '../classes/class.schema';
import { encryptSchemaFrom } from '../common/field-policy';
import { DeliveryRecord, DeliverySchema } from '../deliveries/delivery.schema';
import { decrypt, encryptRecord } from '../utils/encryption';
import { LessonRecord, LessonSchema } from '../lessons/lesson.schema';
import { SettingsRecord, SettingsSchema } from '../settings/settings.schema';
import { SettingsService } from '../settings/settings.service';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { UserRecord, UserSchema } from '../users/user.schema';
import { UsersService } from '../users/users.service';
import {
  BROADCAST_FIELD_POLICY,
  BroadcastRecord,
  BroadcastSchema,
} from './broadcast.schema';
import { TopicRebuildService } from './topic-rebuild.service';

const NOW = DateTime.fromISO('2026-09-06T18:00:00Z', { zone: 'utc' });
const ENCRYPT_SCHEMA = encryptSchemaFrom(BROADCAST_FIELD_POLICY);

describe('TopicRebuildService.rebuild', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let broadcastModel: Model<BroadcastRecord>;
  let lessonModel: Model<LessonRecord>;
  let classModel: Model<ClassRecord>;
  let deliveryModel: Model<DeliveryRecord>;
  let settingsService: SettingsService;
  let service: TopicRebuildService;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    broadcastModel = connection.model<BroadcastRecord>(
      BroadcastRecord.name,
      BroadcastSchema,
    );
    lessonModel = connection.model<LessonRecord>(LessonRecord.name, LessonSchema);
    classModel = connection.model<ClassRecord>(ClassRecord.name, ClassSchema);
    deliveryModel = connection.model<DeliveryRecord>(DeliveryRecord.name, DeliverySchema);
    const userModel = connection.model<UserRecord>(UserRecord.name, UserSchema);
    const settingsModel = connection.model<SettingsRecord>(
      SettingsRecord.name,
      SettingsSchema,
    );
    const usersService = new UsersService(userModel);
    settingsService = new SettingsService(
      settingsModel,
      lessonModel,
      classModel,
      usersService,
    );
    service = new TopicRebuildService(
      broadcastModel,
      lessonModel,
      classModel,
      deliveryModel,
      settingsService,
      usersService,
    );
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  afterEach(async () => {
    await Promise.all([
      broadcastModel.deleteMany({}),
      lessonModel.deleteMany({}),
      classModel.deleteMany({}),
      deliveryModel.deleteMany({}),
      connection.model(SettingsRecord.name).deleteMany({}),
    ]);
  });

  async function createClass() {
    return classModel.create(
      encryptRecord(
        {
          title: 'цигун для глаз',
          groupLabel: '',
          format: 'online',
          zoomLink: 'https://zoom.example/1',
          tz: 'Asia/Jerusalem',
          leadMinutes: 30,
          active: true,
          channelIds: [],
        },
        CLASS_ENCRYPT_SCHEMA,
      ),
    );
  }

  it('scheduled-рассылка — текст пересобирается с новой темой', async () => {
    const cls = await createClass();
    const lesson = await lessonModel.create({
      classId: cls._id,
      startsAt: NOW.plus({ minutes: 10 }).toJSDate(),
      durationMin: 60,
      topic: 'старая тема',
      status: 'scheduled',
    });
    const broadcast = await broadcastModel.create(
      encryptRecord(
        {
          kind: 'lesson_link',
          lessonId: lesson._id,
          channelIds: [],
          scheduledAt: NOW.toJSDate(),
          text: 'старый текст',
          status: 'scheduled',
        },
        ENCRYPT_SCHEMA,
      ),
    );
    await lessonModel.updateOne({ _id: lesson._id }, { $set: { topic: 'новая тема' } });

    await expect(service.rebuild(lesson._id, NOW)).resolves.toBe(true);

    const updated = await broadcastModel.findById(broadcast._id).lean();
    expect(decrypt(updated?.text)).toContain('новая тема');
  });

  it('раннер уже забрал доставку (status sending) — текст не трогаем, false (ревью п.6)', async () => {
    const cls = await createClass();
    const lesson = await lessonModel.create({
      classId: cls._id,
      startsAt: NOW.plus({ minutes: 10 }).toJSDate(),
      durationMin: 60,
      topic: 'старая тема',
      status: 'scheduled',
    });
    const broadcast = await broadcastModel.create(
      encryptRecord(
        {
          kind: 'lesson_link',
          lessonId: lesson._id,
          channelIds: [],
          scheduledAt: NOW.toJSDate(),
          text: 'старый текст',
          status: 'scheduled',
        },
        ENCRYPT_SCHEMA,
      ),
    );
    // Раннер захватил доставку этим же тиком (DeliveryRunnerService.run —
    // claimDelivery) — broadcast.status при этом ещё 'scheduled', пересборка
    // должна это заметить сама, не полагаясь на статус рассылки.
    await deliveryModel.create({
      broadcastId: broadcast._id,
      channelId: new Types.ObjectId(),
      status: 'sending',
      lockedAt: NOW.toJSDate(),
    });
    await lessonModel.updateOne({ _id: lesson._id }, { $set: { topic: 'новая тема' } });

    await expect(service.rebuild(lesson._id, NOW)).resolves.toBe(false);

    const untouched = await broadcastModel.findById(broadcast._id).lean();
    expect(decrypt(untouched?.text)).toBe('старый текст');
  });

  it('доставку захватывают в окне между проверками (M7 аудита) — текст не трогаем', async () => {
    const cls = await createClass();
    const lesson = await lessonModel.create({
      classId: cls._id,
      startsAt: NOW.plus({ minutes: 10 }).toJSDate(),
      durationMin: 60,
      topic: 'старая тема',
      status: 'scheduled',
    });
    const broadcast = await broadcastModel.create(
      encryptRecord(
        {
          kind: 'lesson_link',
          lessonId: lesson._id,
          channelIds: [],
          scheduledAt: NOW.toJSDate(),
          text: 'старый текст',
          status: 'scheduled',
        },
        ENCRYPT_SCHEMA,
      ),
    );
    const delivery = await deliveryModel.create({
      broadcastId: broadcast._id,
      channelId: new Types.ObjectId(),
      status: 'pending',
    });
    await lessonModel.updateOne({ _id: lesson._id }, { $set: { topic: 'новая тема' } });

    // Первая проверка доставок видит `pending` и пропускает дальше — раннер
    // захватывает доставку уже после неё, в окне из нескольких `await`
    // (занятие, класс, настройки, рендер). Без реального планировщика и
    // setTimeout воспроизводим это подменой одного из промежуточных шагов
    // (settingsService.get): к моменту его вызова доставка становится
    // `sending`, и вторая проверка перед `updateOne` должна это заметить.
    const originalGet = settingsService.get.bind(settingsService);
    const getSpy = jest.spyOn(settingsService, 'get').mockImplementationOnce(async () => {
      await deliveryModel.updateOne(
        { _id: delivery._id },
        { $set: { status: 'sending', lockedAt: NOW.toJSDate() } },
      );
      return originalGet();
    });

    try {
      await expect(service.rebuild(lesson._id, NOW)).resolves.toBe(false);
    } finally {
      getSpy.mockRestore();
    }

    const untouched = await broadcastModel.findById(broadcast._id).lean();
    expect(decrypt(untouched?.text)).toBe('старый текст');
  });

  it('рассылка уже cancelled — текст не трогаем', async () => {
    const cls = await createClass();
    const lesson = await lessonModel.create({
      classId: cls._id,
      startsAt: NOW.plus({ minutes: 10 }).toJSDate(),
      durationMin: 60,
      topic: 'тема',
      status: 'scheduled',
    });
    const broadcast = await broadcastModel.create(
      encryptRecord(
        {
          kind: 'lesson_link',
          lessonId: lesson._id,
          channelIds: [],
          scheduledAt: NOW.toJSDate(),
          text: 'причина отмены',
          status: 'cancelled',
        },
        ENCRYPT_SCHEMA,
      ),
    );

    await expect(service.rebuild(lesson._id, NOW)).resolves.toBe(false);

    const updated = await broadcastModel.findById(broadcast._id).lean();
    expect(decrypt(updated?.text)).toBe('причина отмены');
  });

  it('рассылки для занятия нет — тихо выходит, не бросает', async () => {
    const cls = await createClass();
    const lesson = await lessonModel.create({
      classId: cls._id,
      startsAt: NOW.plus({ minutes: 10 }).toJSDate(),
      durationMin: 60,
      topic: 'тема',
      status: 'scheduled',
    });

    await expect(service.rebuild(lesson._id, NOW)).resolves.toBe(false);
  });

  it('занятие удалено между сохранением темы и пересборкой — тихо выходит', async () => {
    const cls = await createClass();
    const lesson = await lessonModel.create({
      classId: cls._id,
      startsAt: NOW.plus({ minutes: 10 }).toJSDate(),
      durationMin: 60,
      topic: 'тема',
      status: 'scheduled',
    });
    await broadcastModel.create(
      encryptRecord(
        {
          kind: 'lesson_link',
          lessonId: lesson._id,
          channelIds: [],
          scheduledAt: NOW.toJSDate(),
          text: 'текст',
          status: 'scheduled',
        },
        ENCRYPT_SCHEMA,
      ),
    );
    await lessonModel.deleteOne({ _id: lesson._id });

    await expect(service.rebuild(lesson._id, NOW)).resolves.toBe(false);
  });

  it('занятие есть, но класс уже удалён — тихо выходит, не бросает', async () => {
    const cls = await createClass();
    const lesson = await lessonModel.create({
      classId: cls._id,
      startsAt: NOW.plus({ minutes: 10 }).toJSDate(),
      durationMin: 60,
      topic: 'тема',
      status: 'scheduled',
    });
    const broadcast = await broadcastModel.create(
      encryptRecord(
        {
          kind: 'lesson_link',
          lessonId: lesson._id,
          channelIds: [],
          scheduledAt: NOW.toJSDate(),
          text: 'старый текст',
          status: 'scheduled',
        },
        ENCRYPT_SCHEMA,
      ),
    );
    await classModel.deleteOne({ _id: cls._id });

    await expect(service.rebuild(lesson._id, NOW)).resolves.toBe(false);

    const untouched = await broadcastModel.findById(broadcast._id).lean();
    expect(decrypt(untouched?.text)).toBe('старый текст');
  });

  it('неожиданный сбой (настройки школы недоступны) — логируется, не бросает', async () => {
    const cls = await createClass();
    const lesson = await lessonModel.create({
      classId: cls._id,
      startsAt: NOW.plus({ minutes: 10 }).toJSDate(),
      durationMin: 60,
      topic: 'тема',
      status: 'scheduled',
    });
    await broadcastModel.create(
      encryptRecord(
        {
          kind: 'lesson_link',
          lessonId: lesson._id,
          channelIds: [],
          scheduledAt: NOW.toJSDate(),
          text: 'текст',
          status: 'scheduled',
        },
        ENCRYPT_SCHEMA,
      ),
    );
    const failingService = new TopicRebuildService(
      broadcastModel,
      lessonModel,
      classModel,
      deliveryModel,
      {
        get: jest.fn().mockRejectedValue(new Error('mongo упал')),
      } as unknown as SettingsService,
      { findById: jest.fn() } as unknown as UsersService,
    );

    await expect(failingService.rebuild(lesson._id, NOW)).resolves.toBe(false);
  });
});
