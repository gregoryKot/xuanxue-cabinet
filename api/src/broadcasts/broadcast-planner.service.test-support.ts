// Общая обвязка для broadcast-planner.service.spec.ts (базовое поведение
// тика) и broadcast-planner.window.spec.ts (расширенное окно предпросмотра,
// read-after-write с DeliveryRunnerService) — один файл был больше
// спек-лимита в 300 строк (CLAUDE.md «Файлы»), обвязка общая, чтобы не
// дублировать её (jscpd).
import { DateTime } from 'luxon';
import type { Connection, Model, Types } from 'mongoose';
import { ChannelRecord } from '../channels/channel.schema';
import { CLASS_ENCRYPT_SCHEMA, ClassRecord } from '../classes/class.schema';
import { LessonRecord } from '../lessons/lesson.schema';
import { DeliveryRecord } from '../deliveries/delivery.schema';
import { SettingsRecord } from '../settings/settings.schema';
import { SettingsService } from '../settings/settings.service';
import { UserRecord } from '../users/user.schema';
import { UsersService } from '../users/users.service';
import { BroadcastRecord } from './broadcast.schema';
import { BroadcastPlannerService } from './broadcast-planner.service';
import { encryptRecord } from '../utils/encryption';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';

export const NOW = DateTime.fromISO('2026-09-06T18:00:00Z', { zone: 'utc' });

export interface PlannerTestContext {
  memory: MemoryMongo;
  connection: Connection;
  classModel: Model<ClassRecord>;
  lessonModel: Model<LessonRecord>;
  broadcastModel: Model<BroadcastRecord>;
  deliveryModel: Model<DeliveryRecord>;
  channelModel: Model<ChannelRecord>;
  userModel: Model<UserRecord>;
  service: BroadcastPlannerService;
}

export async function setupPlannerTest(): Promise<PlannerTestContext> {
  const memory = await openMemoryMongo();
  const connection = memory.connection;
  const classModel = connection.model<ClassRecord>(ClassRecord.name);
  const lessonModel = connection.model<LessonRecord>(LessonRecord.name);
  const broadcastModel = connection.model<BroadcastRecord>(BroadcastRecord.name);
  const deliveryModel = connection.model<DeliveryRecord>(DeliveryRecord.name);
  const channelModel = connection.model<ChannelRecord>(ChannelRecord.name);
  const userModel = connection.model<UserRecord>(UserRecord.name);
  const settingsModel = connection.model<SettingsRecord>(SettingsRecord.name);
  const usersService = new UsersService(userModel);
  const service = new BroadcastPlannerService(
    classModel,
    lessonModel,
    broadcastModel,
    deliveryModel,
    channelModel,
    new SettingsService(settingsModel, lessonModel, classModel, usersService),
    usersService,
  );
  return {
    memory,
    connection,
    classModel,
    lessonModel,
    broadcastModel,
    deliveryModel,
    channelModel,
    userModel,
    service,
  };
}

export async function clearPlannerTest(ctx: PlannerTestContext): Promise<void> {
  await Promise.all([
    ctx.classModel.deleteMany({}),
    ctx.lessonModel.deleteMany({}),
    ctx.broadcastModel.deleteMany({}),
    ctx.deliveryModel.deleteMany({}),
    ctx.channelModel.deleteMany({}),
    ctx.userModel.deleteMany({}),
    ctx.connection.model(SettingsRecord.name).deleteMany({}),
  ]);
}

/** Активный telegram-канал — по умолчанию у класса есть хотя бы один такой
 * (findActiveChannelIds иначе не находит ничего и рассылка не создаётся). */
export async function createChannel(
  ctx: PlannerTestContext,
  overrides: Partial<ChannelRecord> = {},
) {
  return ctx.channelModel.create({
    type: 'telegram',
    title: 'Канал школы',
    config: '{}',
    target: '',
    active: true,
    ...overrides,
  });
}

export async function createClass(
  ctx: PlannerTestContext,
  overrides: Partial<ClassRecord> = {},
) {
  const channelIds = overrides.channelIds ?? [(await createChannel(ctx))._id];
  // Как в проде: ссылка класса лежит шифротекстом — планировщик её расшифровывает.
  return ctx.classModel.create(
    encryptRecord(
      {
        title: 'цигун для глаз',
        groupLabel: '',
        format: 'online',
        zoomLink: 'https://zoom.example/1',
        tz: 'Asia/Jerusalem',
        leadMinutes: 30,
        active: true,
        ...overrides,
        channelIds,
      },
      CLASS_ENCRYPT_SCHEMA,
    ),
  );
}

export async function createLesson(
  ctx: PlannerTestContext,
  classId: Types.ObjectId,
  startsAt: Date,
  overrides: Partial<LessonRecord> = {},
) {
  return ctx.lessonModel.create({
    classId,
    startsAt,
    durationMin: 60,
    status: 'scheduled',
    ...overrides,
  });
}
