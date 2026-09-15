// Против настоящей Mongo (mongodb-memory-server — CLAUDE.md «Тесты»):
// PersonalChats/NotificationPrefsService/UsersService/UserNamesService
// настоящие, бот — фейк (сеть здесь ни при чём, TelegramBotService.sendMessage
// уже покрыт своим спеком). Кто получает уведомление — дело дефолтов роли
// (shared/src/notifications.ts) и личных переключений, оба проверены здесь
// сквозь весь путь: attempt_submitted и exam_result — слой 4.7, PLAN §11.
import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { DateTime } from 'luxon';
import type { Connection, Model } from 'mongoose';
import type { UserRole } from '@xuanxue/shared';
import { ChannelRecord, ChannelSchema } from '../channels/channel.schema';
import { NotificationPrefsRecord } from '../notifications/notification-prefs.schema';
import { NotificationPrefsService } from '../notifications/notification-prefs.service';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { UserNamesService } from '../users/user-names.service';
import { UserRecord, UserSchema } from '../users/user.schema';
import { UsersService } from '../users/users.service';
import { PersonalChats } from './personal-chats';
import { TelegramExamNotifier } from './telegram-exam-notifier';
import type { TelegramBotService } from './telegram-bot.service';

const NOW = DateTime.fromISO('2026-09-13T09:00:00Z', { zone: 'utc' });
const PUBLIC_URL = 'https://xuanxue.su';
const ATTEMPT_CONTEXT = {
  attemptId: '507f1f77bcf86cd799439011',
  examId: '507f1f77bcf86cd799439012',
  examTitle: 'Экзамен по третьей форме',
};

function fakeBot(delivered = true): {
  sendMessage: jest.Mock<Promise<boolean>, [string, string]>;
} {
  return {
    sendMessage: jest
      .fn<Promise<boolean>, [string, string]>()
      .mockResolvedValue(delivered),
  };
}

function fakeConfig(publicUrl: string | undefined = PUBLIC_URL): ConfigService {
  return { get: () => publicUrl } as unknown as ConfigService;
}

describe('TelegramExamNotifier', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let userModel: Model<UserRecord>;
  let channelModel: Model<ChannelRecord>;
  let notificationPrefsModel: Model<NotificationPrefsRecord>;
  let personalChats: PersonalChats;
  let userNamesService: UserNamesService;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    userModel = connection.model<UserRecord>(UserRecord.name, UserSchema);
    channelModel = connection.model<ChannelRecord>(ChannelRecord.name, ChannelSchema);
    notificationPrefsModel = connection.model<NotificationPrefsRecord>(
      NotificationPrefsRecord.name,
    );
    const usersService = new UsersService(userModel);
    personalChats = new PersonalChats(
      usersService,
      channelModel,
      new NotificationPrefsService(notificationPrefsModel),
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

  async function connectPerson(
    telegramId: number,
    name: string,
    roles: UserRole[],
  ): Promise<string> {
    const user = await userModel.create({ name, telegramId, roles });
    await channelModel.create({
      type: 'telegram',
      title: `Личные сообщения: ${name}`,
      config: '{}',
      target: String(telegramId),
      active: true,
    });
    return user._id.toString();
  }

  function buildNotifier(
    bot: ReturnType<typeof fakeBot>,
    config: ConfigService = fakeConfig(),
  ): TelegramExamNotifier {
    return new TelegramExamNotifier(
      personalChats,
      userNamesService,
      bot as unknown as TelegramBotService,
      config,
    );
  }

  describe('notifyAttemptSubmitted', () => {
    it('уходит учителю и помощнику (дефолт роли), не уходит админу', async () => {
      await connectPerson(111, 'Мария', ['teacher']);
      await connectPerson(222, 'Пётр', ['assistant']);
      await connectPerson(333, 'Дима', ['admin']);
      const studentId = await connectPerson(444, 'Ученик', []);
      const bot = fakeBot();

      await buildNotifier(bot).notifyAttemptSubmitted(
        { ...ATTEMPT_CONTEXT, userId: studentId },
        NOW,
      );

      const chatIds = bot.sendMessage.mock.calls.map(([chatId]) => chatId);
      expect(chatIds.sort()).toEqual(['111', '222']);
    });

    it('учитель выключил вид — не уходит ему, помощнику уходит', async () => {
      const teacherId = await connectPerson(111, 'Мария', ['teacher']);
      await connectPerson(222, 'Пётр', ['assistant']);
      await notificationPrefsModel.create({
        userId: teacherId,
        overrides: [{ kind: 'attempt_submitted', enabled: false }],
      });
      const bot = fakeBot();

      await buildNotifier(bot).notifyAttemptSubmitted(
        { ...ATTEMPT_CONTEXT, userId: 'u1' },
        NOW,
      );

      const chatIds = bot.sendMessage.mock.calls.map(([chatId]) => chatId);
      expect(chatIds).toEqual(['222']);
    });

    it('ни у кого нет личного чата — не падает, ничего не шлёт', async () => {
      const bot = fakeBot();

      await expect(
        buildNotifier(bot).notifyAttemptSubmitted(
          { ...ATTEMPT_CONTEXT, userId: 'u1' },
          NOW,
        ),
      ).resolves.toBeUndefined();
      expect(bot.sendMessage).not.toHaveBeenCalled();
    });

    it('текст несёт имя ученика и ссылку на карточку проверки', async () => {
      await connectPerson(111, 'Мария', ['teacher']);
      const studentId = await connectPerson(444, 'Ольга', []);
      const bot = fakeBot();

      await buildNotifier(bot).notifyAttemptSubmitted(
        { ...ATTEMPT_CONTEXT, userId: studentId },
        NOW,
      );

      const [, text] = bot.sendMessage.mock.calls[0] ?? [];
      expect(text).toContain('Ольга');
      expect(text).toContain(`${PUBLIC_URL}/grading/${ATTEMPT_CONTEXT.attemptId}`);
    });

    it('сбой доставки всем адресатам — эскалация error-логом, не тишина (аудит 2026-09, находка 2)', async () => {
      await connectPerson(111, 'Мария', ['teacher']);
      const studentId = await connectPerson(444, 'Ученик', []);
      const bot = fakeBot(false); // sendMessage «дошёл», но с false — бот заблокирован
      const error = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);

      await buildNotifier(bot).notifyAttemptSubmitted(
        { ...ATTEMPT_CONTEXT, userId: studentId },
        NOW,
      );

      expect(error).toHaveBeenCalledWith(
        expect.stringContaining('доставка не удалась'),
        expect.objectContaining({
          attemptId: ATTEMPT_CONTEXT.attemptId,
          kind: 'attempt_submitted',
        }),
      );
      error.mockRestore();
    });
  });

  describe('notifyExamGraded', () => {
    it('уходит тому самому ученику, у кого включён exam_result', async () => {
      const studentId = await connectPerson(555, 'Ученик', []);
      const bot = fakeBot();

      await buildNotifier(bot).notifyExamGraded(
        { ...ATTEMPT_CONTEXT, userId: studentId, outcome: 'passed', comment: undefined },
        NOW,
      );

      expect(bot.sendMessage).toHaveBeenCalledWith(
        '555',
        expect.stringContaining('Экзамен сдан.'),
      );
    });

    it('ученик выключил exam_result — не уходит', async () => {
      const studentId = await connectPerson(555, 'Ученик', []);
      await notificationPrefsModel.create({
        userId: studentId,
        overrides: [{ kind: 'exam_result', enabled: false }],
      });
      const bot = fakeBot();

      await buildNotifier(bot).notifyExamGraded(
        { ...ATTEMPT_CONTEXT, userId: studentId, outcome: 'passed', comment: undefined },
        NOW,
      );

      expect(bot.sendMessage).not.toHaveBeenCalled();
    });

    it('у ученика нет личного чата — не падает, ничего не шлёт', async () => {
      const bot = fakeBot();

      await expect(
        buildNotifier(bot).notifyExamGraded(
          { ...ATTEMPT_CONTEXT, userId: 'u1', outcome: 'passed', comment: undefined },
          NOW,
        ),
      ).resolves.toBeUndefined();
      expect(bot.sendMessage).not.toHaveBeenCalled();
    });

    it('сбой доставки — эскалация error-логом, не тишина (аудит 2026-09, находка 2)', async () => {
      const studentId = await connectPerson(555, 'Ученик', []);
      const bot = fakeBot(false);
      const error = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);

      await buildNotifier(bot).notifyExamGraded(
        { ...ATTEMPT_CONTEXT, userId: studentId, outcome: 'passed', comment: undefined },
        NOW,
      );

      expect(error).toHaveBeenCalledWith(
        expect.stringContaining('доставка не удалась'),
        expect.objectContaining({
          attemptId: ATTEMPT_CONTEXT.attemptId,
          kind: 'exam_result',
        }),
      );
      error.mockRestore();
    });
  });
});
