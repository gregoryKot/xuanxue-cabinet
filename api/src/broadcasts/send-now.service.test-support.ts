// Обвязка для send-now.service.spec.ts — mongodb-memory-server (CLAUDE.md
// «Тесты»), тот же приём, что broadcast-planner.service.test-support.ts.
// createChannel/createClass/createLesson переиспользуются оттуда же
// (CLAUDE.md «Одна механика — один компонент»), не копируются: их сигнатуры
// сужены до `Pick<PlannerTestContext, …>` ровно ради этого.
import { DateTime } from 'luxon';
import type { Connection, Model } from 'mongoose';
import { ChannelRecord } from '../channels/channel.schema';
import { ClassRecord } from '../classes/class.schema';
import { LessonRecord } from '../lessons/lesson.schema';
import { DeliveryRecord } from '../deliveries/delivery.schema';
import { SettingsRecord } from '../settings/settings.schema';
import { SettingsService } from '../settings/settings.service';
import { UserRecord } from '../users/user.schema';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { BroadcastModels } from './broadcast-models.provider';
import { BroadcastRecord } from './broadcast.schema';
import { BroadcastsService } from './broadcasts.service';
import { openTestModels } from './broadcast-planner.service.test-support';
import { SendNowService } from './send-now.service';

export {
  createChannel,
  createClass,
  createLesson,
} from './broadcast-planner.service.test-support';

export const NOW = DateTime.fromISO('2026-09-06T18:00:00Z', { zone: 'utc' });

export interface SendNowTestContext {
  memory: MemoryMongo;
  connection: Connection;
  classModel: Model<ClassRecord>;
  lessonModel: Model<LessonRecord>;
  broadcastModel: Model<BroadcastRecord>;
  deliveryModel: Model<DeliveryRecord>;
  channelModel: Model<ChannelRecord>;
  service: SendNowService;
}

export async function setupSendNowTest(): Promise<SendNowTestContext> {
  const memory = await openMemoryMongo();
  const connection = memory.connection;
  const {
    classModel,
    lessonModel,
    broadcastModel,
    deliveryModel,
    channelModel,
    settingsModel,
    usersService,
  } = openTestModels(connection);
  const settingsService = new SettingsService(
    settingsModel,
    lessonModel,
    classModel,
    usersService,
  );
  const broadcastsService = new BroadcastsService(
    broadcastModel,
    deliveryModel,
    channelModel,
  );
  const models = new BroadcastModels(
    lessonModel,
    classModel,
    channelModel,
    broadcastModel,
    deliveryModel,
  );
  const service = new SendNowService(
    models,
    settingsService,
    usersService,
    broadcastsService,
  );
  return {
    memory,
    connection,
    classModel,
    lessonModel,
    broadcastModel,
    deliveryModel,
    channelModel,
    service,
  };
}

export async function clearSendNowTest(ctx: SendNowTestContext): Promise<void> {
  await Promise.all([
    ctx.classModel.deleteMany({}),
    ctx.lessonModel.deleteMany({}),
    ctx.broadcastModel.deleteMany({}),
    ctx.deliveryModel.deleteMany({}),
    ctx.channelModel.deleteMany({}),
    ctx.connection.model(UserRecord.name).deleteMany({}),
    ctx.connection.model(SettingsRecord.name).deleteMany({}),
  ]);
}
