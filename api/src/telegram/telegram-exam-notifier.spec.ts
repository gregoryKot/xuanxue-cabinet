// Против настоящей Mongo (mongodb-memory-server — CLAUDE.md «Тесты»):
// PersonalChats/NotificationPrefsService/UsersService настоящие, бот и
// ExamBotPort (карточка проверки, слой 4б.5) — фейки (сеть здесь ни при чём,
// TelegramBotService.sendMessage уже покрыт своим спеком, а карточка —
// exam-attempt-review.spec.ts/exam-gradings.service.spec.ts). Кто получает
// уведомление — дело дефолтов роли (shared/src/notifications.ts) и личных
// переключений, оба проверены здесь сквозь весь путь: attempt_submitted и
// exam_result — слой 4.7, PLAN §11.
import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { DateTime } from 'luxon';
import type { Connection, Model } from 'mongoose';
import type { AttemptReviewDto, UserRole } from '@xuanxue/shared';
import { ChannelRecord, ChannelSchema } from '../channels/channel.schema';
import { NotificationPrefsRecord } from '../notifications/notification-prefs.schema';
import { NotificationPrefsService } from '../notifications/notification-prefs.service';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { UserRecord, UserSchema } from '../users/user.schema';
import { UsersService } from '../users/users.service';
import { ExamBotPortRegistry } from './exam-bot-port.registry';
import { fakeExamBotPort } from './exam-bot.port.test-support';
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

function fakeReview(overrides: Partial<AttemptReviewDto> = {}): AttemptReviewDto {
  return {
    attemptId: ATTEMPT_CONTEXT.attemptId,
    examId: ATTEMPT_CONTEXT.examId,
    examTitle: ATTEMPT_CONTEXT.examTitle,
    userId: 'u1',
    userName: 'Ольга',
    status: 'submitted',
    blocks: [],
    ...overrides,
  };
}

function fakePortRegistry(review: AttemptReviewDto | null): ExamBotPortRegistry {
  const registry = new ExamBotPortRegistry();
  registry.set(
    fakeExamBotPort({
      loadAttemptReview: jest.fn().mockResolvedValue(review),
    }),
  );
  return registry;
}

function fakeBot(delivered = true): {
  sendMessage: jest.Mock<Promise<boolean>, [string, string, unknown?]>;
} {
  return {
    sendMessage: jest
      .fn<Promise<boolean>, [string, string, unknown?]>()
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
    examBotPorts: ExamBotPortRegistry = fakePortRegistry(fakeReview()),
  ): TelegramExamNotifier {
    return new TelegramExamNotifier(
      personalChats,
      examBotPorts,
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

      const result = await buildNotifier(bot).notifyAttemptSubmitted(
        { ...ATTEMPT_CONTEXT, userId: studentId },
        NOW,
      );

      const chatIds = bot.sendMessage.mock.calls.map(([chatId]) => chatId);
      expect(chatIds.sort()).toEqual(['111', '222']);
      expect(result).toEqual({ recipients: 2 });
    });

    it('учитель выключил вид — не уходит ему, помощнику уходит', async () => {
      const teacherId = await connectPerson(111, 'Мария', ['teacher']);
      await connectPerson(222, 'Пётр', ['assistant']);
      await notificationPrefsModel.create({
        userId: teacherId,
        overrides: [{ kind: 'attempt_submitted', enabled: false }],
      });
      const bot = fakeBot();

      const result = await buildNotifier(bot).notifyAttemptSubmitted(
        { ...ATTEMPT_CONTEXT, userId: 'u1' },
        NOW,
      );

      const chatIds = bot.sendMessage.mock.calls.map(([chatId]) => chatId);
      expect(chatIds).toEqual(['222']);
      expect(result).toEqual({ recipients: 1 });
    });

    it('ни у кого нет личного чата — не падает, ничего не шлёт, но warn с причиной (2026-09-17: тихий отказ)', async () => {
      const bot = fakeBot();
      const warn = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);

      await expect(
        buildNotifier(bot).notifyAttemptSubmitted(
          { ...ATTEMPT_CONTEXT, userId: 'u1' },
          NOW,
        ),
      ).resolves.toEqual({ recipients: 0 });

      expect(bot.sendMessage).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('некому отправить'),
        expect.objectContaining({
          attemptId: ATTEMPT_CONTEXT.attemptId,
          examId: ATTEMPT_CONTEXT.examId,
          kind: 'attempt_submitted',
        }),
      );
      warn.mockRestore();
    });

    it('вид «работу сдали» выключен у всех — тот же warn, а не тишина', async () => {
      const teacherId = await connectPerson(111, 'Мария', ['teacher']);
      await notificationPrefsModel.create({
        userId: teacherId,
        overrides: [{ kind: 'attempt_submitted', enabled: false }],
      });
      const bot = fakeBot();
      const warn = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);

      await buildNotifier(bot).notifyAttemptSubmitted(
        { ...ATTEMPT_CONTEXT, userId: 'u1' },
        NOW,
      );

      expect(bot.sendMessage).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('некому отправить'),
        expect.objectContaining({ attemptId: ATTEMPT_CONTEXT.attemptId }),
      );
      warn.mockRestore();
    });

    it('текст несёт имя ученика, ссылку на карточку проверки и кнопки итога', async () => {
      await connectPerson(111, 'Мария', ['teacher']);
      const studentId = await connectPerson(444, 'Ольга', []);
      const bot = fakeBot();

      const result = await buildNotifier(
        bot,
        fakeConfig(),
        fakePortRegistry(fakeReview({ userName: 'Ольга' })),
      ).notifyAttemptSubmitted({ ...ATTEMPT_CONTEXT, userId: studentId }, NOW);

      const [, text, buttons] = bot.sendMessage.mock.calls[0] ?? [];
      expect(text).toContain('Ольга');
      expect(text).toContain(`${PUBLIC_URL}/grading/${ATTEMPT_CONTEXT.attemptId}`);
      expect(buttons).toEqual([
        expect.arrayContaining([
          expect.objectContaining({ text: 'Зачёт' }),
          expect.objectContaining({ text: 'Доработать' }),
          expect.objectContaining({ text: 'Незачёт' }),
        ]),
      ]);
      expect(result).toEqual({ recipients: 1 });
    });

    it('попытка не найдена в карточке — не падает, ничего не шлёт (защита в глубину)', async () => {
      await connectPerson(111, 'Мария', ['teacher']);
      const studentId = await connectPerson(444, 'Ольга', []);
      const bot = fakeBot();

      await expect(
        buildNotifier(bot, fakeConfig(), fakePortRegistry(null)).notifyAttemptSubmitted(
          { ...ATTEMPT_CONTEXT, userId: studentId },
          NOW,
        ),
      ).resolves.toEqual({ recipients: 0 });
      expect(bot.sendMessage).not.toHaveBeenCalled();
    });

    it('порт не собран (ExamsModule не поднят) — warn, не бросает', async () => {
      await connectPerson(111, 'Мария', ['teacher']);
      const studentId = await connectPerson(444, 'Ольга', []);
      const bot = fakeBot();
      const warn = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);

      await expect(
        buildNotifier(
          bot,
          fakeConfig(),
          new ExamBotPortRegistry(),
        ).notifyAttemptSubmitted({ ...ATTEMPT_CONTEXT, userId: studentId }, NOW),
      ).resolves.toEqual({ recipients: 0 });

      expect(bot.sendMessage).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('exam.notifyAttemptSubmitted'),
        expect.objectContaining({ attemptId: ATTEMPT_CONTEXT.attemptId }),
      );
      warn.mockRestore();
    });

    it('сбой доставки всем адресатам — эскалация error-логом, не тишина (аудит 2026-09, находка 2)', async () => {
      await connectPerson(111, 'Мария', ['teacher']);
      const studentId = await connectPerson(444, 'Ученик', []);
      const bot = fakeBot(false); // sendMessage «дошёл», но с false — бот заблокирован
      const error = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);

      const result = await buildNotifier(bot).notifyAttemptSubmitted(
        { ...ATTEMPT_CONTEXT, userId: studentId },
        NOW,
      );

      // Адресат был (чат учителя нашли и пытались отправить) — «не дошло» и
      // «некому было слать» различает вызывающий код, поэтому recipients
      // остаётся числом попыток, а не нулём при отказе бота.
      expect(result).toEqual({ recipients: 1 });
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

      const result = await buildNotifier(bot).notifyExamGraded(
        { ...ATTEMPT_CONTEXT, userId: studentId, outcome: 'passed', comment: undefined },
        NOW,
      );

      expect(bot.sendMessage).toHaveBeenCalledWith(
        '555',
        expect.stringContaining('Экзамен сдан.'),
      );
      expect(result).toEqual({ recipients: 1 });
    });

    it('ученик выключил exam_result — не уходит', async () => {
      const studentId = await connectPerson(555, 'Ученик', []);
      await notificationPrefsModel.create({
        userId: studentId,
        overrides: [{ kind: 'exam_result', enabled: false }],
      });
      const bot = fakeBot();

      await expect(
        buildNotifier(bot).notifyExamGraded(
          {
            ...ATTEMPT_CONTEXT,
            userId: studentId,
            outcome: 'passed',
            comment: undefined,
          },
          NOW,
        ),
      ).resolves.toEqual({ recipients: 0 });

      expect(bot.sendMessage).not.toHaveBeenCalled();
    });

    it('у ученика нет личного чата — не падает, ничего не шлёт, но warn с причиной (2026-09-17: тихий отказ)', async () => {
      const bot = fakeBot();
      const warn = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);

      await expect(
        buildNotifier(bot).notifyExamGraded(
          { ...ATTEMPT_CONTEXT, userId: 'u1', outcome: 'passed', comment: undefined },
          NOW,
        ),
      ).resolves.toEqual({ recipients: 0 });

      expect(bot.sendMessage).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('некуда отправить'),
        expect.objectContaining({
          attemptId: ATTEMPT_CONTEXT.attemptId,
          examId: ATTEMPT_CONTEXT.examId,
          kind: 'exam_result',
        }),
      );
      // Без PII и без userId — по логу ищут по attemptId (CLAUDE.md «Логи»).
      expect(JSON.stringify(warn.mock.calls)).not.toContain('u1');
      warn.mockRestore();
    });

    it('сбой резолва чата — warn, не бросает', async () => {
      const studentId = await connectPerson(555, 'Ученик', []);
      const bot = fakeBot();
      const warn = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);
      const chatFor = jest
        .spyOn(personalChats, 'chatFor')
        .mockRejectedValueOnce(new Error('mongo упал'));

      await expect(
        buildNotifier(bot).notifyExamGraded(
          {
            ...ATTEMPT_CONTEXT,
            userId: studentId,
            outcome: 'passed',
            comment: undefined,
          },
          NOW,
        ),
      ).resolves.toEqual({ recipients: 0 });

      expect(bot.sendMessage).not.toHaveBeenCalled();
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('exam.notifyExamGraded'),
        expect.objectContaining({ attemptId: ATTEMPT_CONTEXT.attemptId }),
      );
      chatFor.mockRestore();
      warn.mockRestore();
    });

    it('сбой доставки — эскалация error-логом, не тишина (аудит 2026-09, находка 2)', async () => {
      const studentId = await connectPerson(555, 'Ученик', []);
      const bot = fakeBot(false);
      const error = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);

      const result = await buildNotifier(bot).notifyExamGraded(
        { ...ATTEMPT_CONTEXT, userId: studentId, outcome: 'passed', comment: undefined },
        NOW,
      );

      // Чат нашли, слать пытались — «дошло» бот уже не гарантирует, но
      // recipients не про это (см. комментарий в notifyAttemptSubmitted выше).
      expect(result).toEqual({ recipients: 1 });
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
