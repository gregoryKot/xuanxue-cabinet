// Сквозной тест почтового резерва (слой 4.7, PLAN §11, ADR-0039) — образец
// telegram/start-then-exam-graded.spec.ts, только путь ученика другой: вход
// по email-ссылке (EmailLoginUserService.createFromEmail, ADR-0029), бота он
// не подключал вовсе. CompositeExamNotifier.notifyExamGraded должен дойти
// письмом — Telegram-плечо молчит (нет чата), почтовое отправляет.
// Против настоящей Mongo (mongodb-memory-server) и настоящего fetch-мока
// (тот же приём, что mail.service.spec.ts) — сеть не трогаем, но проверяем
// реальный путь через MailService, не фейк.
import type { ConfigService } from '@nestjs/config';
import { DateTime } from 'luxon';
import type { Connection, Model } from 'mongoose';
import { ChannelRecord, ChannelSchema } from '../channels/channel.schema';
import { NotificationPrefsRecord } from '../notifications/notification-prefs.schema';
import { NotificationPrefsService } from '../notifications/notification-prefs.service';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { ExamBotPortRegistry } from '../telegram/exam-bot-port.registry';
import { PersonalChats } from '../telegram/personal-chats';
import { TelegramExamNotifier } from '../telegram/telegram-exam-notifier';
import type { TelegramBotService } from '../telegram/telegram-bot.service';
import { EmailLoginUserService } from '../users/email-login-user.service';
import { UserNamesService } from '../users/user-names.service';
import { UserRecord, UserSchema } from '../users/user.schema';
import { UsersService } from '../users/users.service';
import { CompositeExamNotifier } from '../exams/exam-notifier.composite';
import { MailExamNotifier } from './mail-exam-notifier';
import { MailService } from './mail.service';

const NOW = DateTime.fromISO('2026-09-17T09:00:00Z', { zone: 'utc' });
const ATTEMPT_CONTEXT = {
  attemptId: '507f1f77bcf86cd799439011',
  examId: '507f1f77bcf86cd799439012',
  examTitle: 'Экзамен по третьей форме',
};
const STUDENT_EMAIL = 'ученик@example.com';

function fakeConfig(): ConfigService {
  return {
    get: (key: string) =>
      ({
        PUBLIC_URL: 'https://xuanxue.su',
        RESEND_API_KEY: 're_test_key',
        MAIL_FROM: 'Школа <school@xuanxue.su>',
      })[key],
  } as unknown as ConfigService;
}

// Бот не должен звать sendMessage вовсе — у ученика нет чата, но конструктор
// TelegramExamNotifier требует TelegramBotService по типу.
function inertBot(): TelegramBotService {
  return {
    sendMessage: jest
      .fn()
      .mockRejectedValue(new Error('sendMessage не должен был вызываться')),
  } as unknown as TelegramBotService;
}

describe('вход по email → CompositeExamNotifier.notifyExamGraded (сквозной путь почтового резерва)', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let userModel: Model<UserRecord>;
  let channelModel: Model<ChannelRecord>;
  let notificationPrefsModel: Model<NotificationPrefsRecord>;
  let composite: CompositeExamNotifier;
  let fetchSpy: jest.SpyInstance<ReturnType<typeof fetch>, Parameters<typeof fetch>>;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    userModel = connection.model<UserRecord>(UserRecord.name, UserSchema);
    channelModel = connection.model<ChannelRecord>(ChannelRecord.name, ChannelSchema);
    notificationPrefsModel = connection.model<NotificationPrefsRecord>(
      NotificationPrefsRecord.name,
    );
    await userModel.syncIndexes();

    const usersService = new UsersService(userModel);
    const notificationPrefsService = new NotificationPrefsService(notificationPrefsModel);
    const personalChats = new PersonalChats(
      usersService,
      channelModel,
      notificationPrefsService,
    );
    const userNamesService = new UserNamesService(userModel);
    // Тест про notifyExamGraded — она ExamBotPort не зовёт (карточка нужна
    // только notifyAttemptSubmitted, слой 4б.5), поэтому реестр остаётся
    // несобранным: настоящего порта здесь нет и не нужен.
    const telegram = new TelegramExamNotifier(
      personalChats,
      new ExamBotPortRegistry(),
      inertBot(),
      fakeConfig(),
    );
    const mail = new MailExamNotifier(
      usersService,
      userNamesService,
      personalChats,
      notificationPrefsService,
      new MailService(fakeConfig()),
      fakeConfig(),
    );
    composite = new CompositeExamNotifier(telegram, mail);
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  afterEach(async () => {
    await userModel.deleteMany({});
    await channelModel.deleteMany({});
    await notificationPrefsModel.deleteMany({});
    fetchSpy.mockRestore();
  });

  beforeEach(() => {
    fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue({ ok: true, status: 200 } as Response);
  });

  it('ученик вошёл по email-ссылке, бота не подключал → результат экзамена уходит письмом', async () => {
    const student = await new EmailLoginUserService(userModel).createFromEmail(
      STUDENT_EMAIL,
    );

    const result = await composite.notifyExamGraded(
      { ...ATTEMPT_CONTEXT, userId: student.id, outcome: 'passed', comment: undefined },
      NOW,
    );

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [, init] = fetchSpy.mock.calls[0] ?? [];
    const body = JSON.parse(init?.body as string) as { to: string; text: string };
    expect(body.to).toBe(STUDENT_EMAIL);
    expect(body.text).toContain('Экзамен сдан.');
    // Telegram-плечо молчит (нет чата), адресат один — от почты.
    expect(result).toEqual({ recipients: 1 });
  });
});
