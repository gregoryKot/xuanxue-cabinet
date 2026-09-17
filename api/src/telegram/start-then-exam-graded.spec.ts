// Сквозной тест на сам разрыв блокера аудита 2026-09-15: до фикса
// PersonalChats.chatFor() для ученика ВСЕГДА отдавал null, потому что канал
// заводился только для штата (StartHandler) — telegram-exam-notifier.spec.ts
// этого не ловил, потому что заводил канал напрямую в Mongo, минуя /start.
// Здесь — тем самым путём, каким ученик реально подключается: StartHandler.
// handle() на настоящую /start (ADR-0027), а следом
// TelegramExamNotifier.notifyExamGraded() — «учитель поставил оценку»
// (ExamGradingsService.grade() зовёт тот же метод, PLAN.md §11 слой 4.7).
// Против настоящей Mongo (mongodb-memory-server — CLAUDE.md «Тесты»).
//
// Баг с #131 (найден 2026-09-16): тот же разрыв, но для входа по
// ссылке-приглашению (/start join_<код>, ADR-0030) — join() заводил человека
// в active, но welcomeConnectedUser не звался, и PersonalChats.chatFor() для
// него тоже отдавал null до второго /start. Ниже — invite-код теперь
// валиден (fakeInviteLinkService), а не всегда отклоняется.
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
import { EmailLoginUserService } from '../users/email-login-user.service';
import type { InviteLinkService } from '../users/invite-link.service';
import { LoginIdentityService } from '../users/login-identity.service';
import type { TelegramLinkService } from '../users/telegram-link.service';
import { UserRecord, UserSchema } from '../users/user.schema';
import { UsersService } from '../users/users.service';
import { BotSessionRecord, BotSessionSchema } from './bot-session.schema';
import { BotSessionService } from './bot-session.service';
import { BotUserAccessService } from './bot-user-access.service';
import { ExamBotPortRegistry } from './exam-bot-port.registry';
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
const VALID_INVITE_CODE = 'a'.repeat(32);

// `first_name: 'Ученик'` — используется createFromTelegram/fullName при
// входе по ссылке-приглашению незнакомцем (payload `join_<код>`).
function fakeStartCtx(telegramId: number, payload?: string): Context {
  return {
    chat: { type: 'private' },
    from: { id: telegramId, first_name: 'Ученик' },
    message: { text: payload ? `/start ${payload}` : '/start' },
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
    // Валиден только VALID_INVITE_CODE — тот же фейк, что fakeInviteLinkService
    // в start.handler.spec.ts, а не «всегда false»: новый тест ниже проходит
    // по-настоящему через join_<код>, не только через обычный /start.
    const fakeInviteLinkService = {
      isValid: (code: string) => Promise.resolve(code === VALID_INVITE_CODE),
    } as unknown as InviteLinkService;
    const loginIdentity = new LoginIdentityService(
      fakeConfig(),
      usersService,
      new EmailLoginUserService(userModel),
      fakeInviteLinkService,
    );
    startHandler = new StartHandler(
      settingsService,
      new ChannelConfigService(channelModel, classModel),
      new BotSessionService(botSessionModel),
      new BotUserAccessService(usersService),
      loginIdentity,
      inertTelegramLinkService(),
      fakeConfig(),
    );
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
    // Тест про notifyExamGraded — карточка проверки (ExamBotPort, слой 4б.5)
    // нужна только notifyAttemptSubmitted, реестр остаётся несобранным.
    return new TelegramExamNotifier(
      personalChats,
      new ExamBotPortRegistry(),
      bot as unknown as TelegramBotService,
      fakeConfig(),
    );
  }

  it('ученик нажал /start → результат экзамена доходит', async () => {
    const student = await userModel.create({ name: 'Ольга', telegramId: 900, roles: [] });
    await startHandler.handle(fakeStartCtx(900), NOW);
    const bot = fakeBot();

    const result = await buildNotifier(bot).notifyExamGraded(
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
    expect(result).toEqual({ recipients: 1 });
  });

  // «Молча» здесь больше нет: с 2026-09-17 канал пишет свой warn с причиной
  // (#187), а нулевой счётчик адресатов видит композит.
  it('ученик НЕ нажимал /start — уведомление не уходит, ничего не падает (прежнее поведение)', async () => {
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
    ).resolves.toEqual({ recipients: 0 });

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

  // Баг с #131 (найден 2026-09-16 на аудите): join_<код> заводил
  // человека в active, но welcomeConnectedUser не звался — PersonalChats.chatFor()
  // отдавал null до второго /start, и результат экзамена не доходил. Пользователя
  // заранее НЕ создаём — по ссылке приходит именно незнакомец.
  it('незнакомец открыл ссылку-приглашение (/start join_<код>) → результат экзамена доходит без второго /start', async () => {
    await startHandler.handle(fakeStartCtx(903, `join_${VALID_INVITE_CODE}`), NOW);
    const created = await userModel.findOne({ telegramId: 903 }).lean();
    expect(created?.status).toBe('active');
    const bot = fakeBot();

    const result = await buildNotifier(bot).notifyExamGraded(
      {
        ...ATTEMPT_CONTEXT,
        userId: created?._id.toString() ?? '',
        outcome: 'passed',
        comment: undefined,
      },
      NOW,
    );

    expect(bot.sendMessage).toHaveBeenCalledWith(
      '903',
      expect.stringContaining('Экзамен сдан.'),
    );
    expect(result).toEqual({ recipients: 1 });
  });
});
