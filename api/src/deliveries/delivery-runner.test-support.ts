// Общая обвязка для delivery-runner.service.spec.ts и
// delivery-runner.cancellation.spec.ts — один файл был больше спек-лимита в
// 300 строк (CLAUDE.md «Файлы»), тесты раннера разделены по смыслу (штатная
// отправка/повтор vs сбои до адаптера и cancelled), обвязка — общая, чтобы не
// дублировать её (jscpd).
import type { ConfigService } from '@nestjs/config';
import type { Connection, Model } from 'mongoose';
import { DateTime } from 'luxon';
import type { ChannelAdapter } from '../channels/channel-adapter';
import { ChannelAdapterRegistry } from '../channels/channel-adapter.registry';
import { ChannelConfigService } from '../channels/channel-config.service';
import { ChannelRecord, ChannelSchema } from '../channels/channel.schema';
import { ManualAdapter } from '../channels/manual.adapter';
import {
  BROADCAST_FIELD_POLICY,
  BroadcastRecord,
  BroadcastSchema,
} from '../broadcasts/broadcast.schema';
import { ClassRecord, ClassSchema } from '../classes/class.schema';
import { LessonRecord, LessonSchema } from '../lessons/lesson.schema';
import { encryptSchemaFrom } from '../common/field-policy';
import { encryptRecord } from '../utils/encryption';
import { DeliveryRunnerService } from './delivery-runner.service';
import { DeliveryRecord, DeliverySchema } from './delivery.schema';
import type { FailedDeliveryContext, TeacherNotifier } from './teacher-notifier';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';

export const NOW = DateTime.fromISO('2026-09-06T18:00:00Z', { zone: 'utc' });
export const ENCRYPT_SCHEMA = encryptSchemaFrom(BROADCAST_FIELD_POLICY);
export const BOT_TOKEN = 'secret-bot-token';

function fakeConfig(): ConfigService {
  return { get: () => BOT_TOKEN } as unknown as ConfigService;
}

export function fakeNotifier(): TeacherNotifier & { calls: FailedDeliveryContext[] } {
  const calls: FailedDeliveryContext[] = [];
  return {
    calls,
    notifyDeliveryFailed(context) {
      calls.push(context);
      return Promise.resolve();
    },
    notifySchedulerFailed() {
      return Promise.resolve();
    },
    notifyBroadcastCancelled() {
      return Promise.resolve();
    },
  };
}

function registryWith(telegram: ChannelAdapter): ChannelAdapterRegistry {
  return new ChannelAdapterRegistry([telegram, new ManualAdapter()]);
}

export interface RunnerTestContext {
  memory: MemoryMongo;
  connection: Connection;
  deliveryModel: Model<DeliveryRecord>;
  broadcastModel: Model<BroadcastRecord>;
  channelModel: Model<ChannelRecord>;
  lessonModel: Model<LessonRecord>;
  channelConfig: ChannelConfigService;
}

export async function setupRunnerTest(): Promise<RunnerTestContext> {
  const memory = await openMemoryMongo();
  const connection = memory.connection;
  const deliveryModel = connection.model<DeliveryRecord>(
    DeliveryRecord.name,
    DeliverySchema,
  );
  const broadcastModel = connection.model<BroadcastRecord>(
    BroadcastRecord.name,
    BroadcastSchema,
  );
  const channelModel = connection.model<ChannelRecord>(ChannelRecord.name, ChannelSchema);
  const lessonModel = connection.model<LessonRecord>(LessonRecord.name, LessonSchema);
  const classModel = connection.model<ClassRecord>(ClassRecord.name, ClassSchema);
  return {
    memory,
    connection,
    deliveryModel,
    broadcastModel,
    channelModel,
    lessonModel,
    channelConfig: new ChannelConfigService(channelModel, classModel),
  };
}

export async function clearRunnerTest(ctx: RunnerTestContext): Promise<void> {
  await Promise.all([
    ctx.deliveryModel.deleteMany({}),
    ctx.broadcastModel.deleteMany({}),
    ctx.channelModel.deleteMany({}),
    ctx.lessonModel.deleteMany({}),
  ]);
}

export function buildRunner(
  ctx: RunnerTestContext,
  adapter: ChannelAdapter,
  notifier: TeacherNotifier,
): DeliveryRunnerService {
  return new DeliveryRunnerService(
    ctx.deliveryModel,
    ctx.broadcastModel,
    ctx.lessonModel,
    ctx.channelConfig,
    registryWith(adapter),
    fakeConfig(),
    notifier,
  );
}

export async function seedDelivery(
  ctx: RunnerTestContext,
): Promise<{ channelId: string; broadcastId: string }> {
  const channel = await ctx.channelConfig.upsertTelegramChat({
    chatId: '@school',
    title: 'Школа',
  });
  const broadcast = await ctx.broadcastModel.create(
    encryptRecord(
      {
        kind: 'lesson_link',
        channelIds: [channel.id],
        scheduledAt: NOW.toJSDate(),
        text: 'через 10 минут занятие https://zoom.example/1',
        status: 'scheduled',
      },
      ENCRYPT_SCHEMA,
    ),
  );
  await ctx.deliveryModel.create({ broadcastId: broadcast._id, channelId: channel.id });
  return { channelId: channel.id, broadcastId: broadcast._id.toString() };
}
