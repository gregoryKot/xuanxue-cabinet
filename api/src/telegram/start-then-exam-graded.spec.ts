// Сквозной тест на сам разрыв блокера аудита 2026-09-15: до фикса
// PersonalChats.chatFor() для ученика ВСЕГДА отдавал null, потому что канал
// заводился только для штата (StartHandler) — telegram-exam-notifier.spec.ts
// этого не ловил, потому что заводил канал напрямую в Mongo, минуя /start.
// Здесь — тем самым путём, каким ученик реально подключается: StartHandler.
// handle() на настоящую /start (ADR-0027, ADR-0026), а следом
// TelegramExamNotifier.notifyExamGraded() — «учитель поставил оценку»
// (ExamGradingsService.grade() зовёт тот же метод, PLAN.md §11 слой 4.7).
// Против настоящей Mongo (mongodb-memory-server — CLAUDE.md «Тесты»).
import type { ConfigService } from '@nestjs/config';
import { DateTime } from 'luxon';
import type { Connection, Model } from 'mongoose';
import type { Context } from 'telegraf';
import { ChannelConfigService } from '../channels/channel-config.service';
import { ChannelRecord, ChannelSchema } from '../channels/channel.schema';
import { ClassRecord, ClassSchema } from '../classes/class.schema';
import { LessonRecord, LessonSchema } from '../lessons/lesson.schema';
import { NotificationPrefsRecord } from '../notifications/notification-prefs.schema';
import { NotificationPrefsService } from '../notifications/notification-prefs.service';
import { SettingsRecord, SettingsSchema } from '../settings/settings.schema';
import { SettingsService } from '../settings/settings.service';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import type { InviteLinkService } from '../users/invite-link.service';
import { JoinByInviteService } from '../users/join-by-invite.service';
import type { TelegramLinkService } from '../users/telegram-link.service';
import { UserNamesService } from '../users/user-names.service';
import { UserRolesService } from '../users/user-roles.service';
import { UserRecord, UserSchema } from '../users/user.schema';
import { UsersService } from '../users/users.service';
import { BotSessionRecord, BotSessionSchema } from './bot-session.schema';
import { BotSessionService } from './bot-session.service';
import { BotUserAccessService } from './bot-user-access.service';
import { StartHandler } from './handlers/start.handler';
import { PersonalChats } from './personal-chats';
import { TelegramExamNotifier } from './telegram-exam-notifier';
import type { TelegramBotService } from './telegram-bot.service';

const NOW = DateTime.fromISO('2026-09-15T09:00:00Z', { zone: 'utc' });
const ATTEMPT_CONTEXT = {
  attemptId: '507f1f77bcf86cd799439011',
  examId: '507f1f77bcf86cd799439012',
  examTitle: 'Экзамен по третьей форме',
};

function fakeStartCtx(telegramId: number): Context {
  return {
    chat: { type: 'private' },
    from: { id: telegramId },
    message: { text: '/start' },
    reply: () => Promise.resolve(),
  } as unknown as Context;
}

function fakeBot(): { sendMessage: jest.Mock<Promise<boolean>, [string, string]> } {
  return {
    sendMessage: jest.fn<Promise<boolean>, [string, string]>().mockResolvedValue(true),
  };
}

function fakeConfig(): ConfigService {
  return { get: () => undefined } as unknown as ConfigService;
}

// Ветка link_<code> вне сценария этого теста (сквозной путь ученика через
// обычный /start) — фейк нужен только для конструктора.
function inertTelegramLinkService(): TelegramLinkService {
  return {
    linkByCode: () => Promise.reject(new Error('linkByCode не должен был вызываться')),
  } as unknown as TelegramLinkService;
}

describe('/start ученика → TelegramExamNotifier.notifyExamGraded (сквозной путь слоя 4.7)', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let userModel: Model<UserRecord>;
  let channelModel: Model<ChannelRecord>;
  let classModel: Model<ClassRecord>;
  let lessonModel: Model<LessonRecord>;
  let settingsModel: Model<SettingsRecord>;
  let botSessionModel: Model<BotSessionRecord>;
  let notificationPrefsModel: Model<NotificationPrefsRecord>;
  let startHandler: StartHandler;
  let userNamesService: UserNamesService;
  let personalChats: PersonalChats;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    userModel = connection.model<UserRecord>(UserRecord.name, UserSchema);
    channelModel = connection.model<ChannelRecord>(ChannelRecord.name, ChannelSchema);
    classModel = connection.model<ClassRecord>(ClassRecord.name, ClassSchema);
    lessonModel = connection.model<LessonRecord>(LessonRecord.name, LessonSchema);
    settingsModel = connection.model<SettingsRecord>(SettingsRecord.name, SettingsSchema);
    botSessionModel = connection.model<BotSessionRecord>(
      BotSessionRecord.name,
      BotSessionSchema,
    );
    notificationPrefsModel = connection.model<NotificationPrefsRecord>(
      NotificationPrefsRecord.name,
    );
    await channelModel.syncIndexes();

    const usersService = new UsersService(userModel);
    const settingsService = new SettingsService(
      settingsModel,
      lessonModel,
      classModel,
      usersService,
    );
    const inertInviteLinkService = {
      isValid: () => Promise.resolve(false),
    } as unknown as InviteLinkService;
    startHandler = new StartHandler(
      settingsService,
      new ChannelConfigService(channelModel, classModel),
      new BotSessionService(botSessionModel),
      new BotUserAccessService(usersService),
      usersService,
      new JoinByInviteService(
        inertInviteLinkService,
        new UserRolesService(userModel, usersService),
        usersService,
      ),
      inertInviteLinkService,
      inertTelegramLinkService(),
      fakeConfig(),
    );
    userNamesService = new UserNamesService(userModel);
    personalChats = new PersonalChats(
      usersService,
      channelModel,
      new NotificationPrefsService(notificationPrefsModel),
    );
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  afterEach(async () => {
    await userModel.deleteMany({});
    await channelModel.deleteMany({});
    await classModel.deleteMany({});
    await settingsModel.deleteMany({});
    await botSessionModel.deleteMany({});
    await notificationPrefsModel.deleteMany({});
  });

  function buildNotifier(bot: ReturnType<typeof fakeBot>): TelegramExamNotifier {
    return new TelegramExamNotifier(
      personalChats,
      userNamesService,
      bot as unknown as TelegramBotService,
      fakeConfig(),
    );
  }

  it('ученик нажал /start → результат экзамена доходит', async () => {
    const student = await userModel.create({ name: 'Ольга', telegramId: 900, roles: [] });
    await startHandler.handle(fakeStartCtx(900), NOW);
    const bot = fakeBot();

    await buildNotifier(bot).notifyExamGraded(
      {
        ...ATTEMPT_CONTEXT,
        userId: student._id.toString(),
        outcome: 'passed',
        comment: undefined,
      },
      NOW,
    );

    expect(bot.sendMessage).toHaveBeenCalledWith(
      '900',
      expect.stringContaining('Экзамен сдан.'),
    );
  });

  it('ученик НЕ нажимал /start — уведомление молча не уходит, ничего не падает (прежнее поведение)', async () => {
    const student = await userModel.create({ name: 'Пётр', telegramId: 901, roles: [] });
    const bot = fakeBot();

    await expect(
      buildNotifier(bot).notifyExamGraded(
        {
          ...ATTEMPT_CONTEXT,
          userId: student._id.toString(),
          outcome: 'passed',
          comment: undefined,
        },
        NOW,
      ),
    ).resolves.toBeUndefined();

    expect(bot.sendMessage).not.toHaveBeenCalled();
  });

  it('ученик подключился, но личный канал школы (не он сам) не стал каналом рассылки занятия', async () => {
    const active = await classModel.create({
      title: 'Тайцзицюань',
      format: 'online',
      active: true,
    });
    await userModel.create({ name: 'Ольга', telegramId: 902, roles: [] });

    await startHandler.handle(fakeStartCtx(902), NOW);

    const classAfter = await classModel.findById(active._id).lean();
    expect(classAfter?.channelIds).toHaveLength(0);
  });
});
