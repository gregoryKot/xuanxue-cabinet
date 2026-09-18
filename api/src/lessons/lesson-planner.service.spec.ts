// Против настоящей Mongo (mongodb-memory-server, не мок модели — CLAUDE.md
// «Тесты»): generate/reconcile планировщика на реальных индексах и запросах.
import { DateTime } from 'luxon';
import type { Connection, Model } from 'mongoose';
import { Types } from 'mongoose';
import { BroadcastModels } from '../broadcasts/broadcast-models.provider';
import {
  BROADCAST_FIELD_POLICY,
  BroadcastRecord,
  BroadcastSchema,
} from '../broadcasts/broadcast.schema';
import { LessonLinkRebuildService } from '../broadcasts/lesson-link-rebuild.service';
import { ChannelRecord, ChannelSchema } from '../channels/channel.schema';
import { ClassRecord, ClassSchema, type LeanScheduleRule } from '../classes/class.schema';
import { encryptSchemaFrom } from '../common/field-policy';
import { DeliveryRecord, DeliverySchema } from '../deliveries/delivery.schema';
import { SettingsRecord, SettingsSchema } from '../settings/settings.schema';
import { SettingsService } from '../settings/settings.service';
import { decrypt, encryptRecord } from '../utils/encryption';
import { UserRecord, UserSchema } from '../users/user.schema';
import { UsersService } from '../users/users.service';
import { LessonRecord, LessonSchema } from './lesson.schema';
import { LessonPlannerService } from './lesson-planner.service';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';

const BROADCAST_ENCRYPT_SCHEMA = encryptSchemaFrom(BROADCAST_FIELD_POLICY);

const NOW = DateTime.fromISO('2026-03-20T00:00:00Z', { zone: 'utc' });
const TUESDAY_19 = { weekday: 2 as const, time: '19:00', durationMin: 90 };

type ClassDoc = ClassRecord & { _id: Types.ObjectId; rules: LeanScheduleRule[] };
type LessonDoc = LessonRecord & { _id: Types.ObjectId; updatedAt: Date };

function createClass(
  model: Model<ClassRecord>,
  overrides: Partial<ClassRecord> = {},
): Promise<ClassDoc> {
  return model.create({
    title: 'Тайцзицюань',
    groupLabel: '',
    format: 'online',
    rules: [TUESDAY_19],
    tz: 'Asia/Jerusalem',
    channelIds: [],
    leadMinutes: 30,
    active: true,
    ...overrides,
  }) as unknown as Promise<ClassDoc>;
}

async function setRuleTime(
  model: Model<ClassRecord>,
  cls: ClassDoc,
  ruleIndex: number,
  time: string,
): Promise<void> {
  await model.updateOne(
    { _id: cls._id, 'rules._id': cls.rules[ruleIndex]?._id },
    { $set: { 'rules.$.time': time } },
  );
}

describe('LessonPlannerService', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let classModel: Model<ClassRecord>;
  let lessonModel: Model<LessonRecord>;
  let broadcastModel: Model<BroadcastRecord>;
  let deliveryModel: Model<DeliveryRecord>;
  let service: LessonPlannerService;

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
    const channelModel = connection.model<ChannelRecord>(
      ChannelRecord.name,
      ChannelSchema,
    );
    const userModel = connection.model<UserRecord>(UserRecord.name, UserSchema);
    const settingsModel = connection.model<SettingsRecord>(
      SettingsRecord.name,
      SettingsSchema,
    );
    const usersService = new UsersService(userModel);
    const broadcastModels = new BroadcastModels(
      lessonModel,
      classModel,
      channelModel,
      broadcastModel,
      deliveryModel,
    );
    const lessonLinkRebuild = new LessonLinkRebuildService(
      broadcastModels,
      new SettingsService(settingsModel, lessonModel, classModel, usersService),
      usersService,
    );
    service = new LessonPlannerService(classModel, lessonModel, lessonLinkRebuild);
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  afterEach(async () => {
    await classModel.deleteMany({});
    await lessonModel.deleteMany({});
    await broadcastModel.deleteMany({});
    await deliveryModel.deleteMany({});
  });

  it('генерирует на 4 недели вперёд по двум правилам класса', async () => {
    await createClass(classModel, {
      rules: [TUESDAY_19, { weekday: 4, time: '20:00', durationMin: 60 }],
    });

    const result = await service.plan(NOW);

    expect(result).toEqual({ created: 8, removed: 0 }); // 4 вторника + 4 четверга
    const lessons = await lessonModel.find({}).lean();
    expect(lessons).toHaveLength(8);
    expect(lessons.every((l) => l.status === 'scheduled' && l.topic === '')).toBe(true);
  });

  it('идемпотентность: повторный plan с тем же now ничего не создаёт, updatedAt не меняется', async () => {
    const cls = await createClass(classModel);
    await service.plan(NOW);
    const before = await lessonModel.find({}).sort({ plannedAt: 1 }).lean<LessonDoc[]>();

    const second = await service.plan(NOW);

    expect(second).toEqual({ created: 0, removed: 0 });
    const after = await lessonModel.find({}).sort({ plannedAt: 1 }).lean<LessonDoc[]>();
    expect(after.map((l) => l.updatedAt)).toEqual(before.map((l) => l.updatedAt));
    expect(after).toHaveLength(4);
    expect(String(after[0]?.classId)).toBe(cls._id.toString());
  });

  it('два параллельных plan (Promise.all) — одно множество занятий, без дублей', async () => {
    await createClass(classModel);

    await Promise.all([service.plan(NOW), service.plan(NOW)]);

    const lessons = await lessonModel.find({}).lean();
    expect(lessons).toHaveLength(4);
  });

  it('смена времени правила переносит занятие с темой, второе не создаётся', async () => {
    const cls = await createClass(classModel);
    await service.plan(NOW);
    const [withTopic] = await lessonModel.find({}).sort({ plannedAt: 1 }).lean();
    await lessonModel.updateOne(
      { _id: withTopic?._id },
      { $set: { topic: 'Пятое занятие' } },
    );

    await setRuleTime(classModel, cls, 0, '18:00');
    const result = await service.plan(NOW);

    const afterLessons = await lessonModel.find({}).sort({ plannedAt: 1 }).lean();
    expect(afterLessons).toHaveLength(4); // не расплодилось второе занятие
    const moved = afterLessons.find((l) => String(l._id) === String(withTopic?._id));
    expect(moved?.startsAt.toISOString()).toBe('2026-03-24T16:00:00.000Z'); // 18:00 локально, до перехода (+02:00)
    expect(moved?.topic).toBe('Пятое занятие');
    expect(result.removed).toBe(0);
  });

  it('смена времени правила при уже созданной lesson_link-рассылке пересобирает текст и переносит момент отправки (окно предпросмотра, ADR-0054)', async () => {
    const cls = await createClass(classModel);
    await service.plan(NOW);
    const [withBroadcast] = await lessonModel.find({}).sort({ plannedAt: 1 }).lean();
    // Старый sendAt = 19:00 локально (TUESDAY_19) − leadMinutes(30) = 16:30 UTC
    // (тот же расчёт, что sendLessonBroadcast/broadcast-send-timing.ts).
    const broadcast = await broadcastModel.create(
      encryptRecord(
        {
          kind: 'lesson_link',
          lessonId: withBroadcast?._id,
          channelIds: [],
          scheduledAt: new Date('2026-03-24T16:30:00Z'),
          text: 'старый текст',
          status: 'scheduled',
        },
        BROADCAST_ENCRYPT_SCHEMA,
      ),
    );
    const delivery = await deliveryModel.create({
      broadcastId: broadcast._id,
      channelId: new Types.ObjectId(),
      status: 'pending',
      nextAttemptAt: new Date('2026-03-24T16:30:00Z'),
    });

    // Правило переехало на 18:00 — то же занятие двигается на месте (тест
    // выше), а не удаляется/создаётся заново; окно между leadMinutes и
    // leadMinutes+previewMinutes, где рассылка уже существует, а правило
    // ещё можно поменять, — то самое, что описано в docs/PLAN.md §6.
    await setRuleTime(classModel, cls, 0, '18:00');
    await service.plan(NOW);

    // Новый startsAt — 16:00 UTC (см. тест выше), новый sendAt = 15:30 UTC.
    const updatedBroadcast = await broadcastModel.findById(broadcast._id).lean();
    expect(decrypt(updatedBroadcast?.text)).not.toBe('старый текст');
    expect(updatedBroadcast?.scheduledAt.toISOString()).toBe('2026-03-24T15:30:00.000Z');
    const updatedDelivery = await deliveryModel.findById(delivery._id).lean();
    expect(updatedDelivery?.nextAttemptAt?.toISOString()).toBe(
      '2026-03-24T15:30:00.000Z',
    );
  });

  it('повторный plan после переноса ничего больше не двигает — updatedAt переехавшего занятия не меняется', async () => {
    const cls = await createClass(classModel);
    await service.plan(NOW);
    await setRuleTime(classModel, cls, 0, '18:00');
    await service.plan(NOW);
    const moved = await lessonModel.find({}).sort({ plannedAt: 1 }).lean<LessonDoc[]>();

    await service.plan(NOW);

    const afterSecondTick = await lessonModel
      .find({})
      .sort({ plannedAt: 1 })
      .lean<LessonDoc[]>();
    expect(afterSecondTick.map((l) => l.updatedAt)).toEqual(
      moved.map((l) => l.updatedAt),
    );
  });

  it('уже перенесённое вручную занятие смена времени правила не трогает', async () => {
    const cls = await createClass(classModel);
    await service.plan(NOW);
    const [rescheduled] = await lessonModel.find({}).sort({ plannedAt: 1 }).lean();
    const manualStartsAt = DateTime.fromISO('2026-03-25T10:00:00Z', {
      zone: 'utc',
    }).toJSDate();
    await lessonModel.updateOne(
      { _id: rescheduled?._id },
      { $set: { startsAt: manualStartsAt } },
    );

    await setRuleTime(classModel, cls, 0, '18:00');
    await service.plan(NOW);

    const untouched = await lessonModel.findById(rescheduled?._id).lean();
    expect(untouched?.startsAt.toISOString()).toBe(manualStartsAt.toISOString());
    expect(untouched?.plannedAt?.toISOString()).toBe('2026-03-24T17:00:00.000Z'); // не менялся
  });

  it('смена дня недели правила: старые нетронутые вторники удаляются, новые дни вставляются', async () => {
    const cls = await createClass(classModel);
    await service.plan(NOW);

    await classModel.updateOne(
      { _id: cls._id, 'rules._id': cls.rules[0]?._id },
      { $set: { 'rules.$.weekday': 3 } }, // вторник → среда
    );
    const result = await service.plan(NOW);

    expect(result.removed).toBe(4); // все 4 вторника нетронуты
    const lessons = await lessonModel.find({}).sort({ plannedAt: 1 }).lean();
    expect(lessons).toHaveLength(4);
    expect(
      lessons.every(
        (l) => DateTime.fromJSDate(l.startsAt).setZone('Asia/Jerusalem').weekday === 3,
      ),
    ).toBe(true);
  });

  it('коллизия переносов: два правила меняются местами одним сохранением — три тика без ошибок сходятся к новому расписанию', async () => {
    const cls = await createClass(classModel, {
      rules: [
        { weekday: 2, time: '18:00', durationMin: 90 },
        { weekday: 2, time: '19:00', durationMin: 60 },
      ],
    });
    await service.plan(NOW);
    const cancelledBefore = await lessonModel.find({}).sort({ plannedAt: 1 }).lean();
    // «Тронутое» занятие класса — контрольная точка, что коллизия соседних
    // правил не задевает лишнее.
    await lessonModel.updateOne(
      { _id: cancelledBefore[cancelledBefore.length - 1]?._id },
      { $set: { status: 'cancelled' } },
    );

    await setRuleTime(classModel, cls, 0, '19:00');
    await setRuleTime(classModel, cls, 1, '20:00');
    await expect(service.plan(NOW)).resolves.toBeDefined();
    await expect(service.plan(NOW)).resolves.toBeDefined();
    await expect(service.plan(NOW)).resolves.toBeDefined();

    const lessons = await lessonModel.find({}).sort({ startsAt: 1 }).lean();
    const scheduled = lessons.filter((l) => l.status === 'scheduled');
    const localTimes = [
      ...new Set(
        scheduled.map((l) =>
          DateTime.fromJSDate(l.startsAt).setZone('Asia/Jerusalem').toFormat('HH:mm'),
        ),
      ),
    ].sort();
    expect(localTimes).toEqual(['19:00', '20:00']);
    expect(lessons.some((l) => l.status === 'cancelled')).toBe(true);
  });

  it('удаление правила: нетронутое занятие удаляется, тронутое остаётся', async () => {
    const cls = await createClass(classModel);
    await service.plan(NOW);
    const [untouched, touched] = await lessonModel.find({}).sort({ plannedAt: 1 }).lean();
    await lessonModel.updateOne({ _id: touched?._id }, { $set: { topic: 'Тема' } });

    await classModel.updateOne({ _id: cls._id }, { $set: { rules: [] } });
    const result = await service.plan(NOW);

    // Правил не осталось совсем — «ожидаемое» множество пусто для всех 4
    // занятий, поэтому удаляются все нетронутые (3 из 4), тронутое остаётся.
    expect(result.removed).toBe(3);
    const remaining = await lessonModel.find({}).lean();
    expect(remaining.map((l) => String(l._id))).toEqual([String(touched?._id)]);
    expect(await lessonModel.exists({ _id: untouched?._id })).toBeNull();
  });

  it('класс active:false: нетронутые будущие удалены, тронутые остаются', async () => {
    const cls = await createClass(classModel);
    await service.plan(NOW);
    const [, touched] = await lessonModel.find({}).sort({ plannedAt: 1 }).lean();
    await lessonModel.updateOne({ _id: touched?._id }, { $set: { topic: 'Тема' } });

    await classModel.updateOne({ _id: cls._id }, { $set: { active: false } });
    const result = await service.plan(NOW);

    expect(result.created).toBe(0);
    expect(result.removed).toBe(3);
    const remaining = await lessonModel.find({}).lean();
    expect(remaining.map((l) => String(l._id))).toEqual([String(touched?._id)]);
  });

  it('класса нет в базе — занятия удаляются, даже если тронуты', async () => {
    const cls = await createClass(classModel);
    await service.plan(NOW);
    const lessons = await lessonModel.find({}).lean();
    await lessonModel.updateOne({ _id: lessons[0]?._id }, { $set: { topic: 'Тема' } });

    await classModel.deleteOne({ _id: cls._id });
    const result = await service.plan(NOW);

    expect(result.removed).toBe(4);
    expect(await lessonModel.countDocuments({})).toBe(0);
  });

  it('прошедшие/близкие занятия не трогаются даже без класса', async () => {
    const cls = await createClass(classModel, { leadMinutes: 30 });
    const closeLesson = await lessonModel.create({
      classId: cls._id,
      plannedAt: NOW.plus({ minutes: 10 }).toJSDate(),
      startsAt: NOW.plus({ minutes: 10 }).toJSDate(),
      durationMin: 90,
      ruleId: cls.rules[0]?._id,
      topic: '',
      status: 'scheduled',
      recordings: [],
    });

    await classModel.deleteOne({ _id: cls._id });
    await service.plan(NOW);

    expect(await lessonModel.exists({ _id: closeLesson._id })).not.toBeNull();
  });

  it('невалидный tz — класс пропускается, ошибка не блокирует остальные', async () => {
    await createClass(classModel, { tz: 'Not/AZone' });
    const ok = await createClass(classModel, { title: 'Цигун' });

    const result = await service.plan(NOW);

    expect(result.created).toBe(4); // только валидный класс
    const lessons = await lessonModel.find({}).lean();
    expect(lessons.every((l) => String(l.classId) === ok._id.toString())).toBe(true);
  });

  it('DST на реальных датах: startsAt в UTC учитывает переход времени', async () => {
    await createClass(classModel);
    await service.plan(NOW);
    const lessons = await lessonModel.find({}).sort({ plannedAt: 1 }).lean();
    expect(lessons.map((l) => l.startsAt.toISOString())).toEqual([
      '2026-03-24T17:00:00.000Z',
      '2026-03-31T16:00:00.000Z',
      '2026-04-07T16:00:00.000Z',
      '2026-04-14T16:00:00.000Z',
    ]);
  });
});
