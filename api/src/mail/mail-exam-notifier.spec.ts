// Против настоящей Mongo (mongodb-memory-server — CLAUDE.md «Тесты»):
// PersonalChats/NotificationPrefsService/UsersService/UserNamesService
// настоящие, MailService — фейк (сеть уже покрыта mail.service.spec.ts).
// Образец — telegram-exam-notifier.spec.ts (та же матрица условий, слой 4.7,
// ADR-0039): почта — резерв, включается ровно там, где Telegram молчит.
import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { DateTime } from 'luxon';
import type { Connection, Model } from 'mongoose';
import type { UserRole } from '@xuanxue/shared';
import { ChannelRecord, ChannelSchema } from '../channels/channel.schema';
import { NotificationPrefsRecord } from '../notifications/notification-prefs.schema';
import { NotificationPrefsService } from '../notifications/notification-prefs.service';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { PersonalChats } from '../telegram/personal-chats';
import { UserNamesService } from '../users/user-names.service';
import { UserRecord, UserSchema } from '../users/user.schema';
import { UsersService } from '../users/users.service';
import { MailExamNotifier } from './mail-exam-notifier';
import type { MailService } from './mail.service';

const NOW = DateTime.fromISO('2026-09-17T09:00:00Z', { zone: 'utc' });
const PUBLIC_URL = 'https://xuanxue.su';
const ATTEMPT_CONTEXT = {
  attemptId: '507f1f77bcf86cd799439011',
  examId: '507f1f77bcf86cd799439012',
  examTitle: 'Экзамен по третьей форме',
};

function fakeMailService(delivered = true): {
  sendExamNotification: jest.Mock<
    Promise<boolean>,
    [{ to: string; subject: string; text: string }]
  >;
} {
  return {
    sendExamNotification: jest
      .fn<Promise<boolean>, [{ to: string; subject: string; text: string }]>()
      .mockResolvedValue(delivered),
  };
}

function fakeConfig(publicUrl: string | undefined = PUBLIC_URL): ConfigService {
  return { get: () => publicUrl } as unknown as ConfigService;
}

describe('MailExamNotifier', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let userModel: Model<UserRecord>;
  let channelModel: Model<ChannelRecord>;
  let notificationPrefsModel: Model<NotificationPrefsRecord>;
  let usersService: UsersService;
  let userNamesService: UserNamesService;
  let personalChats: PersonalChats;
  let notificationPrefsService: NotificationPrefsService;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    userModel = connection.model<UserRecord>(UserRecord.name, UserSchema);
    channelModel = connection.model<ChannelRecord>(ChannelRecord.name, ChannelSchema);
    notificationPrefsModel = connection.model<NotificationPrefsRecord>(
      NotificationPrefsRecord.name,
    );
    usersService = new UsersService(userModel);
    notificationPrefsService = new NotificationPrefsService(notificationPrefsModel);
    personalChats = new PersonalChats(
      usersService,
      channelModel,
      notificationPrefsService,
    );
    userNamesService = new UserNamesService(userModel);
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  afterEach(async () => {
    await userModel.deleteMany({});
    await channelModel.deleteMany({});
    await notificationPrefsModel.deleteMany({});
  });

  // Детерминированный telegramId вместо случайного (CLAUDE.md «Тесты»:
  // без источников недетерминизма) — счётчик на afterEach-чистый набор данных
  // каждого теста, коллизий внутри теста не бывает.
  let nextTelegramId = 100;

  async function createStaff(
    email: string,
    name: string,
    roles: UserRole[],
    withChat: boolean,
  ): Promise<string> {
    const telegramId = withChat ? nextTelegramId++ : undefined;
    const user = await userModel.create({ name, email, roles, telegramId });
    if (withChat) {
      await channelModel.create({
        type: 'telegram',
        title: `Личные сообщения: ${name}`,
        config: '{}',
        target: String(telegramId),
        active: true,
      });
    }
    return user._id.toString();
  }

  function buildNotifier(
    mail: ReturnType<typeof fakeMailService>,
    config: ConfigService = fakeConfig(),
  ): MailExamNotifier {
    return new MailExamNotifier(
      usersService,
      userNamesService,
      personalChats,
      notificationPrefsService,
      mail as unknown as MailService,
      config,
    );
  }

  describe('notifyAttemptSubmitted', () => {
    it('у учителя нет чата, но есть email и вид включён (дефолт роли) — письмо уходит', async () => {
      await createStaff('teacher@example.com', 'Мария', ['teacher'], false);
      const studentId = await createStaff('student@example.com', 'Ученик', [], false);
      const mail = fakeMailService();

      await buildNotifier(mail).notifyAttemptSubmitted(
        { ...ATTEMPT_CONTEXT, userId: studentId },
        NOW,
      );

      expect(mail.sendExamNotification).toHaveBeenCalledTimes(1);
      const [call] = mail.sendExamNotification.mock.calls[0] ?? [];
      expect(call?.to).toBe('teacher@example.com');
      expect(call?.text).toContain('Ученик');
    });

    it('у учителя есть активный чат с ботом — письмо не уходит (Telegram основной канал)', async () => {
      await createStaff('teacher@example.com', 'Мария', ['teacher'], true);
      const mail = fakeMailService();

      await buildNotifier(mail).notifyAttemptSubmitted(
        { ...ATTEMPT_CONTEXT, userId: 'u1' },
        NOW,
      );

      expect(mail.sendExamNotification).not.toHaveBeenCalled();
    });

    it('учитель выключил attempt_submitted — письмо не уходит, хотя чата нет', async () => {
      const teacherId = await createStaff(
        'teacher@example.com',
        'Мария',
        ['teacher'],
        false,
      );
      await notificationPrefsModel.create({
        userId: teacherId,
        overrides: [{ kind: 'attempt_submitted', enabled: false }],
      });
      const mail = fakeMailService();

      await buildNotifier(mail).notifyAttemptSubmitted(
        { ...ATTEMPT_CONTEXT, userId: 'u1' },
        NOW,
      );

      expect(mail.sendExamNotification).not.toHaveBeenCalled();
    });

    it('у учителя нет email — письмо не уходит, никого нет в выборке', async () => {
      await userModel.create({ name: 'Мария', telegramId: 900, roles: ['teacher'] });
      const mail = fakeMailService();

      await expect(
        buildNotifier(mail).notifyAttemptSubmitted(
          { ...ATTEMPT_CONTEXT, userId: 'u1' },
          NOW,
        ),
      ).resolves.toBeUndefined();
      expect(mail.sendExamNotification).not.toHaveBeenCalled();
    });

    it('ровно одно письмо на попытку, не по одному на каждого адресата отдельным вызовом сервиса', async () => {
      await createStaff('teacher@example.com', 'Мария', ['teacher'], false);
      const mail = fakeMailService();

      await buildNotifier(mail).notifyAttemptSubmitted(
        { ...ATTEMPT_CONTEXT, userId: 'u1' },
        NOW,
      );

      expect(mail.sendExamNotification).toHaveBeenCalledTimes(1);
    });

    it('сбой MailService (вернул false) — не бросает, эскалация error-логом', async () => {
      await createStaff('teacher@example.com', 'Мария', ['teacher'], false);
      const mail = fakeMailService(false);
      const error = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);

      await expect(
        buildNotifier(mail).notifyAttemptSubmitted(
          { ...ATTEMPT_CONTEXT, userId: 'u1' },
          NOW,
        ),
      ).resolves.toBeUndefined();

      expect(error).toHaveBeenCalledWith(
        expect.stringContaining('доставка не удалась'),
        expect.objectContaining({ kind: 'attempt_submitted' }),
      );
      error.mockRestore();
    });

    it('сбой резолва (Mongo упала) — не бросает, warn-лог, не error', async () => {
      const mail = fakeMailService();
      const boom = jest
        .spyOn(usersService, 'listStaffWithEmail')
        .mockRejectedValue(new Error('Mongo недоступна'));
      const warn = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);

      await expect(
        buildNotifier(mail).notifyAttemptSubmitted(
          { ...ATTEMPT_CONTEXT, userId: 'u1' },
          NOW,
        ),
      ).resolves.toBeUndefined();

      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('Mongo недоступна'),
        expect.objectContaining({ attemptId: ATTEMPT_CONTEXT.attemptId }),
      );
      boom.mockRestore();
      warn.mockRestore();
    });
  });

  describe('notifyExamGraded', () => {
    it('у ученика нет чата, но есть email и вид включён (дефолт) — письмо уходит', async () => {
      const studentId = await createStaff('student@example.com', 'Ученик', [], false);
      const mail = fakeMailService();

      await buildNotifier(mail).notifyExamGraded(
        { ...ATTEMPT_CONTEXT, userId: studentId, outcome: 'passed', comment: undefined },
        NOW,
      );

      expect(mail.sendExamNotification).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'student@example.com' }),
      );
    });

    it('у ученика есть активный чат с ботом — письмо не уходит', async () => {
      const studentId = await createStaff('student@example.com', 'Ученик', [], true);
      const mail = fakeMailService();

      await buildNotifier(mail).notifyExamGraded(
        { ...ATTEMPT_CONTEXT, userId: studentId, outcome: 'passed', comment: undefined },
        NOW,
      );

      expect(mail.sendExamNotification).not.toHaveBeenCalled();
    });

    it('ученик выключил exam_result — письмо не уходит, хотя чата нет', async () => {
      const studentId = await createStaff('student@example.com', 'Ученик', [], false);
      await notificationPrefsModel.create({
        userId: studentId,
        overrides: [{ kind: 'exam_result', enabled: false }],
      });
      const mail = fakeMailService();

      await buildNotifier(mail).notifyExamGraded(
        { ...ATTEMPT_CONTEXT, userId: studentId, outcome: 'passed', comment: undefined },
        NOW,
      );

      expect(mail.sendExamNotification).not.toHaveBeenCalled();
    });

    it('у ученика нет email — письмо не уходит', async () => {
      const student = await userModel.create({
        name: 'Ученик',
        telegramId: 901,
        roles: [],
      });
      const mail = fakeMailService();

      await expect(
        buildNotifier(mail).notifyExamGraded(
          {
            ...ATTEMPT_CONTEXT,
            userId: student._id.toString(),
            outcome: 'passed',
            comment: undefined,
          },
          NOW,
        ),
      ).resolves.toBeUndefined();
      expect(mail.sendExamNotification).not.toHaveBeenCalled();
    });

    it('ровно одно письмо на оценку', async () => {
      const studentId = await createStaff('student@example.com', 'Ученик', [], false);
      const mail = fakeMailService();

      await buildNotifier(mail).notifyExamGraded(
        { ...ATTEMPT_CONTEXT, userId: studentId, outcome: 'passed', comment: undefined },
        NOW,
      );

      expect(mail.sendExamNotification).toHaveBeenCalledTimes(1);
    });

    it('сбой MailService (вернул false) — не бросает, эскалация error-логом', async () => {
      const studentId = await createStaff('student@example.com', 'Ученик', [], false);
      const mail = fakeMailService(false);
      const error = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);

      await expect(
        buildNotifier(mail).notifyExamGraded(
          {
            ...ATTEMPT_CONTEXT,
            userId: studentId,
            outcome: 'passed',
            comment: undefined,
          },
          NOW,
        ),
      ).resolves.toBeUndefined();

      expect(error).toHaveBeenCalledWith(
        expect.stringContaining('доставка не удалась'),
        expect.objectContaining({ kind: 'exam_result' }),
      );
      error.mockRestore();
    });

    it('сбой резолва (Mongo упала) — не бросает, warn-лог, не error', async () => {
      const studentId = await createStaff('student@example.com', 'Ученик', [], false);
      const mail = fakeMailService();
      const boom = jest
        .spyOn(notificationPrefsService, 'get')
        .mockRejectedValue(new Error('Mongo недоступна'));
      const warn = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);

      await expect(
        buildNotifier(mail).notifyExamGraded(
          {
            ...ATTEMPT_CONTEXT,
            userId: studentId,
            outcome: 'passed',
            comment: undefined,
          },
          NOW,
        ),
      ).resolves.toBeUndefined();

      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('Mongo недоступна'),
        expect.objectContaining({ attemptId: ATTEMPT_CONTEXT.attemptId }),
      );
      boom.mockRestore();
      warn.mockRestore();
    });

    it('человека с таким id нет — не падает, ничего не шлёт', async () => {
      const mail = fakeMailService();

      await expect(
        buildNotifier(mail).notifyExamGraded(
          {
            ...ATTEMPT_CONTEXT,
            userId: '507f1f77bcf86cd799439099',
            outcome: 'passed',
            comment: undefined,
          },
          NOW,
        ),
      ).resolves.toBeUndefined();
      expect(mail.sendExamNotification).not.toHaveBeenCalled();
    });
  });
});
