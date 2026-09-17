// Общий тестовый харнесс для start.handler.spec.ts и
// start.handler.join.spec.ts — настоящая Mongo (mongodb-memory-server,
// CLAUDE.md «Тесты»), одна и та же сборка StartHandler/LoginIdentityService.
// Вынесено в отдельный файл: оба спека поднимали одинаковые 6 моделей и 4
// сервиса, дубль ловил check-jscpd-ratchet.mjs (CLAUDE.md «Храповики»).
import type { Connection, Model } from 'mongoose';
import type { ConfigService } from '@nestjs/config';
import type { Context } from 'telegraf';
import { ChannelConfigService } from '../../channels/channel-config.service';
import { ChannelRecord, ChannelSchema } from '../../channels/channel.schema';
import { ClassRecord, ClassSchema } from '../../classes/class.schema';
import { LessonRecord, LessonSchema } from '../../lessons/lesson.schema';
import { SettingsRecord, SettingsSchema } from '../../settings/settings.schema';
import { SettingsService } from '../../settings/settings.service';
import { openMemoryMongo, type MemoryMongo } from '../../test-support/mongo-memory';
import { EmailLoginUserService } from '../../users/email-login-user.service';
import type { InviteLinkService } from '../../users/invite-link.service';
import { LoginIdentityService } from '../../users/login-identity.service';
import { UserRecord, UserSchema } from '../../users/user.schema';
import { UsersService } from '../../users/users.service';
import { BotSessionRecord, BotSessionSchema } from '../bot-session.schema';
import { BotSessionService } from '../bot-session.service';
import { BotUserAccessService } from '../bot-user-access.service';
import { StartHandler } from './start.handler';

/** Код, который фейковый `InviteLinkService` считает валидным — тот же
 * приём, что и в join-invite-deep-link.spec.ts. */
export const VALID_INVITE_CODE = 'a'.repeat(32);
export const TEST_BOOTSTRAP_ADMIN_TELEGRAM_ID = 900_000_001;

function fakeInviteLinkService(): InviteLinkService {
  return {
    isValid: (code: string) => Promise.resolve(code === VALID_INVITE_CODE),
  } as unknown as InviteLinkService;
}

/** По ключам, не заглушка на одно значение: LoginIdentityService читает
 * `BOOTSTRAP_ADMIN_TELEGRAM_ID`, StartHandler — `PUBLIC_URL`, один и тот же
 * фейковый ConfigService отдаёт оба (без `any`, через `Record<string, unknown>`). */
function fakeConfigWithPublicUrl(): ConfigService {
  const values: Record<string, unknown> = {
    PUBLIC_URL: 'https://xuanxue.su',
    BOOTSTRAP_ADMIN_TELEGRAM_ID: TEST_BOOTSTRAP_ADMIN_TELEGRAM_ID,
  };
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

export interface StartHandlerHarness {
  memory: MemoryMongo;
  connection: Connection;
  userModel: Model<UserRecord>;
  channelModel: Model<ChannelRecord>;
  classModel: Model<ClassRecord>;
  lessonModel: Model<LessonRecord>;
  settingsModel: Model<SettingsRecord>;
  botSessionModel: Model<BotSessionRecord>;
  settingsService: SettingsService;
  handler: StartHandler;
}

/** Отдельная сборка `StartHandler` — нужна и харнессу, и тесту «ошибка
 * UsersService внутри BotUserAccessService» (start.handler.spec.ts), где
 * вместо настоящего `UsersService` подставляют падающий фейк только внутри
 * `BotUserAccessService`, остальные зависимости — как в харнессе. */
export function buildStartHandler(
  userModel: Model<UserRecord>,
  channelModel: Model<ChannelRecord>,
  classModel: Model<ClassRecord>,
  botSessionModel: Model<BotSessionRecord>,
  settingsService: SettingsService,
  botAccess: BotUserAccessService = new BotUserAccessService(new UsersService(userModel)),
): StartHandler {
  const loginIdentity = new LoginIdentityService(
    fakeConfigWithPublicUrl(),
    new UsersService(userModel),
    new EmailLoginUserService(userModel),
    fakeInviteLinkService(),
  );
  return new StartHandler(
    settingsService,
    new ChannelConfigService(channelModel, classModel),
    new BotSessionService(botSessionModel),
    botAccess,
    loginIdentity,
    fakeConfigWithPublicUrl(),
  );
}

export async function openStartHandlerHarness(): Promise<StartHandlerHarness> {
  const memory = await openMemoryMongo();
  const connection = memory.connection;
  const userModel = connection.model<UserRecord>(UserRecord.name, UserSchema);
  const channelModel = connection.model<ChannelRecord>(ChannelRecord.name, ChannelSchema);
  const classModel = connection.model<ClassRecord>(ClassRecord.name, ClassSchema);
  const lessonModel = connection.model<LessonRecord>(LessonRecord.name, LessonSchema);
  const settingsModel = connection.model<SettingsRecord>(
    SettingsRecord.name,
    SettingsSchema,
  );
  const botSessionModel = connection.model<BotSessionRecord>(
    BotSessionRecord.name,
    BotSessionSchema,
  );
  await channelModel.syncIndexes();
  const settingsService = new SettingsService(
    settingsModel,
    lessonModel,
    classModel,
    new UsersService(userModel),
  );
  const handler = buildStartHandler(
    userModel,
    channelModel,
    classModel,
    botSessionModel,
    settingsService,
  );

  return {
    memory,
    connection,
    userModel,
    channelModel,
    classModel,
    lessonModel,
    settingsModel,
    botSessionModel,
    settingsService,
    handler,
  };
}

export async function clearStartHandlerHarness(
  harness: StartHandlerHarness,
): Promise<void> {
  await harness.userModel.deleteMany({});
  await harness.channelModel.deleteMany({});
  await harness.classModel.deleteMany({});
  await harness.settingsModel.deleteMany({});
  await harness.botSessionModel.deleteMany({});
}

/** `failSecondReply` — проактивное меню после /start должно пережить сбой
 * сети (человек заблокировал бота между двумя ответами), не повод падать. */
export function fakeCtx(
  telegramId: number | undefined,
  chatType: 'private' | 'group' = 'private',
  failSecondReply = false,
  startPayload?: string,
  firstName = 'Тест',
): {
  ctx: Context;
  replies: string[];
} {
  const replies: string[] = [];
  const ctx = {
    chat: { type: chatType },
    from:
      telegramId === undefined ? undefined : { id: telegramId, first_name: firstName },
    message: { text: startPayload ? `/start ${startPayload}` : '/start' },
    reply: (text: string) => {
      if (failSecondReply && replies.length === 1) {
        return Promise.reject(new Error('бот заблокирован'));
      }
      replies.push(text);
      return Promise.resolve();
    },
  } as unknown as Context;
  return { ctx, replies };
}
