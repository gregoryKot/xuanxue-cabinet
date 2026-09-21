// Резолв адресатов (роль + NotificationPrefsService) — против настоящей
// Mongo (mongodb-memory-server, CLAUDE.md «Тесты»), тем же приёмом, что
// in-app-exam-notifier.spec.ts. Сама отправка (сеть) уже покрыта
// push-sender.service.spec.ts — здесь PushSenderService фейковый: важно
// только «зовём его с правильными userId», не как он шлёт запрос.
import { Logger } from '@nestjs/common';
import { DateTime } from 'luxon';
import type { Connection, Model } from 'mongoose';
import type { UserRole } from '@xuanxue/shared';
import { NotificationPrefsRecord } from '../notifications/notification-prefs.schema';
import { NotificationPrefsService } from '../notifications/notification-prefs.service';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { UserRecord, UserSchema } from '../users/user.schema';
import { UsersService } from '../users/users.service';
import { PushExamNotifier } from './push-exam-notifier';
import type { PushSenderService } from './push-sender.service';

const NOW = DateTime.fromISO('2026-09-21T09:00:00Z', { zone: 'utc' });
const ATTEMPT_CONTEXT = {
  attemptId: '507f1f77bcf86cd799439011',
  examId: '507f1f77bcf86cd799439012',
  examTitle: 'Экзамен по третьей форме',
};

describe('PushExamNotifier', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let userModel: Model<UserRecord>;
  let notificationPrefsModel: Model<NotificationPrefsRecord>;
  let usersService: UsersService;
  let notificationPrefsService: NotificationPrefsService;
  let sendToUser: jest.Mock;
  let pushSender: PushSenderService;
  let notifier: PushExamNotifier;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    userModel = connection.model<UserRecord>(UserRecord.name, UserSchema);
    notificationPrefsModel = connection.model<NotificationPrefsRecord>(
      NotificationPrefsRecord.name,
    );
    usersService = new UsersService(userModel);
    notificationPrefsService = new NotificationPrefsService(notificationPrefsModel);
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  beforeEach(() => {
    // Один счётчик подписок по умолчанию — переопределяется точечно там, где
    // сценарий требует «нет подписок» (mockResolvedValueOnce).
    sendToUser = jest.fn().mockResolvedValue(1);
    pushSender = { sendToUser } as unknown as PushSenderService;
    notifier = new PushExamNotifier(usersService, notificationPrefsService, pushSender);
  });

  afterEach(async () => {
    await userModel.deleteMany({});
    await notificationPrefsModel.deleteMany({});
  });

  async function createUser(
    name: string,
    roles: UserRole[],
    status: 'active' | 'blocked' = 'active',
  ): Promise<string> {
    const user = await userModel.create({ name, roles, status });
    return user._id.toString();
  }

  describe('notifyAttemptSubmitted', () => {
    it('учитель активен, вид включён (дефолт роли), есть подписка — recipients: 1', async () => {
      const teacherId = await createUser('Мария', ['teacher']);

      const result = await notifier.notifyAttemptSubmitted(
        { ...ATTEMPT_CONTEXT, userId: 'u1' },
        NOW,
      );

      expect(result).toEqual({ recipients: 1 });
      expect(sendToUser).toHaveBeenCalledWith(teacherId, NOW);
    });

    it('учитель и помощник — оба адресаты, по вызову на каждого', async () => {
      await createUser('Мария', ['teacher']);
      await createUser('Помощник', ['assistant']);

      const result = await notifier.notifyAttemptSubmitted(
        { ...ATTEMPT_CONTEXT, userId: 'u1' },
        NOW,
      );

      expect(result).toEqual({ recipients: 2 });
      expect(sendToUser).toHaveBeenCalledTimes(2);
    });

    it('вид включён, но подписок у человека нет — он не адресат push (recipients: 0)', async () => {
      await createUser('Мария', ['teacher']);
      sendToUser.mockResolvedValue(0);

      await expect(
        notifier.notifyAttemptSubmitted({ ...ATTEMPT_CONTEXT, userId: 'u1' }, NOW),
      ).resolves.toEqual({ recipients: 0 });
    });

    it('один без подписок, другой с подпиской — recipients: 1, оба вызваны', async () => {
      await createUser('Мария', ['teacher']);
      await createUser('Помощник', ['assistant']);
      sendToUser.mockResolvedValueOnce(0).mockResolvedValueOnce(1);

      const result = await notifier.notifyAttemptSubmitted(
        { ...ATTEMPT_CONTEXT, userId: 'u1' },
        NOW,
      );

      expect(result).toEqual({ recipients: 1 });
      expect(sendToUser).toHaveBeenCalledTimes(2);
    });

    it('заблокированный учитель — не в выборке, push не зовём', async () => {
      await createUser('Мария', ['teacher'], 'blocked');

      await expect(
        notifier.notifyAttemptSubmitted({ ...ATTEMPT_CONTEXT, userId: 'u1' }, NOW),
      ).resolves.toEqual({ recipients: 0 });
      expect(sendToUser).not.toHaveBeenCalled();
    });

    it('учитель выключил attempt_submitted — push не зовём', async () => {
      const teacherId = await createUser('Мария', ['teacher']);
      await notificationPrefsModel.create({
        userId: teacherId,
        overrides: [{ kind: 'attempt_submitted', enabled: false }],
      });

      await expect(
        notifier.notifyAttemptSubmitted({ ...ATTEMPT_CONTEXT, userId: 'u1' }, NOW),
      ).resolves.toEqual({ recipients: 0 });
      expect(sendToUser).not.toHaveBeenCalled();
    });

    it('штата нет вовсе — recipients: 0, без похода за настройками и без push', async () => {
      await expect(
        notifier.notifyAttemptSubmitted({ ...ATTEMPT_CONTEXT, userId: 'u1' }, NOW),
      ).resolves.toEqual({ recipients: 0 });
      expect(sendToUser).not.toHaveBeenCalled();
    });

    it('сбой резолва (Mongo упала) — не бросает, warn-лог, не error', async () => {
      const boom = jest
        .spyOn(usersService, 'listActiveWithRoles')
        .mockRejectedValue(new Error('Mongo недоступна'));
      const warn = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);

      await expect(
        notifier.notifyAttemptSubmitted({ ...ATTEMPT_CONTEXT, userId: 'u1' }, NOW),
      ).resolves.toEqual({ recipients: 0 });

      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('Mongo недоступна'),
        expect.objectContaining({ attemptId: ATTEMPT_CONTEXT.attemptId }),
      );
      boom.mockRestore();
      warn.mockRestore();
    });
  });

  describe('notifyExamGraded', () => {
    it('ученик существует, вид включён (дефолт), есть подписка — recipients: 1', async () => {
      const studentId = await createUser('Ученик', []);

      const result = await notifier.notifyExamGraded(
        { ...ATTEMPT_CONTEXT, userId: studentId, outcome: 'passed', comment: undefined },
        NOW,
      );

      expect(result).toEqual({ recipients: 1 });
      expect(sendToUser).toHaveBeenCalledWith(studentId, NOW);
    });

    it('ученик без единой подписки — recipients: 0, но без падения (человек без подписок — не авария)', async () => {
      const studentId = await createUser('Ученик', []);
      sendToUser.mockResolvedValue(0);

      await expect(
        notifier.notifyExamGraded(
          {
            ...ATTEMPT_CONTEXT,
            userId: studentId,
            outcome: 'passed',
            comment: undefined,
          },
          NOW,
        ),
      ).resolves.toEqual({ recipients: 0 });
    });

    it('ученик выключил exam_result — push не зовём', async () => {
      const studentId = await createUser('Ученик', []);
      await notificationPrefsModel.create({
        userId: studentId,
        overrides: [{ kind: 'exam_result', enabled: false }],
      });

      await expect(
        notifier.notifyExamGraded(
          {
            ...ATTEMPT_CONTEXT,
            userId: studentId,
            outcome: 'passed',
            comment: undefined,
          },
          NOW,
        ),
      ).resolves.toEqual({ recipients: 0 });
      expect(sendToUser).not.toHaveBeenCalled();
    });

    it('человека с таким id нет (аккаунт удалён) — не падает, push не зовём', async () => {
      await expect(
        notifier.notifyExamGraded(
          {
            ...ATTEMPT_CONTEXT,
            userId: '507f1f77bcf86cd799439099',
            outcome: 'passed',
            comment: undefined,
          },
          NOW,
        ),
      ).resolves.toEqual({ recipients: 0 });
      expect(sendToUser).not.toHaveBeenCalled();
    });

    it('сбой резолва (Mongo упала) — не бросает, warn-лог, не error', async () => {
      const studentId = await createUser('Ученик', []);
      const boom = jest
        .spyOn(notificationPrefsService, 'get')
        .mockRejectedValue(new Error('Mongo недоступна'));
      const warn = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);

      await expect(
        notifier.notifyExamGraded(
          {
            ...ATTEMPT_CONTEXT,
            userId: studentId,
            outcome: 'passed',
            comment: undefined,
          },
          NOW,
        ),
      ).resolves.toEqual({ recipients: 0 });

      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('Mongo недоступна'),
        expect.objectContaining({ attemptId: ATTEMPT_CONTEXT.attemptId }),
      );
      boom.mockRestore();
      warn.mockRestore();
    });
  });
});
