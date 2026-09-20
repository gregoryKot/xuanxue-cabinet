// Против настоящей Mongo (mongodb-memory-server — CLAUDE.md «Тесты»):
// UsersService/NotificationPrefsService и сама модель NotificationRecord
// настоящие — идемпотентность и переоценка держатся на уникальном индексе,
// мок модели пропустил бы ошибку самого запроса. Образец — mail-exam-notifier.spec.ts
// (та же матрица условий, слой 4.7), но кабинет не требует ни чата, ни
// email (ADR-0061) — поэтому нет сценариев «нет чата»/«нет email», зато есть
// свои: read-after-write, идемпотентность апсерта, переоценка гасит readAt.
import { Logger } from '@nestjs/common';
import { DateTime } from 'luxon';
import type { Connection, Model } from 'mongoose';
import type { UserRole } from '@xuanxue/shared';
import { NotificationPrefsRecord } from './notification-prefs.schema';
import { NotificationPrefsService } from './notification-prefs.service';
import { NotificationRecord, NotificationSchema } from './notification.schema';
import { InAppExamNotifier } from './in-app-exam-notifier';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { UserRecord, UserSchema } from '../users/user.schema';
import { UsersService } from '../users/users.service';

const NOW = DateTime.fromISO('2026-09-17T09:00:00Z', { zone: 'utc' });
const ATTEMPT_CONTEXT = {
  attemptId: '507f1f77bcf86cd799439011',
  examId: '507f1f77bcf86cd799439012',
  examTitle: 'Экзамен по третьей форме',
};

describe('InAppExamNotifier', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let userModel: Model<UserRecord>;
  let notificationPrefsModel: Model<NotificationPrefsRecord>;
  let notificationModel: Model<NotificationRecord>;
  let usersService: UsersService;
  let notificationPrefsService: NotificationPrefsService;
  let notifier: InAppExamNotifier;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    userModel = connection.model<UserRecord>(UserRecord.name, UserSchema);
    notificationPrefsModel = connection.model<NotificationPrefsRecord>(
      NotificationPrefsRecord.name,
    );
    notificationModel = connection.model<NotificationRecord>(
      NotificationRecord.name,
      NotificationSchema,
    );
    usersService = new UsersService(userModel);
    notificationPrefsService = new NotificationPrefsService(notificationPrefsModel);
    notifier = new InAppExamNotifier(
      usersService,
      notificationPrefsService,
      notificationModel,
    );
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  afterEach(async () => {
    await userModel.deleteMany({});
    await notificationPrefsModel.deleteMany({});
    await notificationModel.deleteMany({});
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
    it('учитель активен, вид включён (дефолт роли) — запись легла (read-after-write)', async () => {
      const teacherId = await createUser('Мария', ['teacher']);

      const result = await notifier.notifyAttemptSubmitted(
        { ...ATTEMPT_CONTEXT, userId: 'u1' },
        NOW,
      );

      expect(result).toEqual({ recipients: 1 });
      const stored = await notificationModel.findOne({ userId: teacherId }).lean();
      expect(stored).toMatchObject({
        userId: teacherId,
        kind: 'attempt_submitted',
        examId: ATTEMPT_CONTEXT.examId,
        attemptId: ATTEMPT_CONTEXT.attemptId,
        readAt: null,
      });
    });

    it('помощник учителя тоже в списке — второй получатель, каждому своя строка', async () => {
      await createUser('Мария', ['teacher']);
      await createUser('Помощник', ['assistant']);

      const result = await notifier.notifyAttemptSubmitted(
        { ...ATTEMPT_CONTEXT, userId: 'u1' },
        NOW,
      );

      expect(result).toEqual({ recipients: 2 });
      expect(await notificationModel.countDocuments({})).toBe(2);
    });

    it('заблокированный учитель — не в выборке, записи нет', async () => {
      await createUser('Мария', ['teacher'], 'blocked');

      await expect(
        notifier.notifyAttemptSubmitted({ ...ATTEMPT_CONTEXT, userId: 'u1' }, NOW),
      ).resolves.toEqual({ recipients: 0 });
      expect(await notificationModel.countDocuments({})).toBe(0);
    });

    it('учитель выключил attempt_submitted — запись не пишется', async () => {
      const teacherId = await createUser('Мария', ['teacher']);
      await notificationPrefsModel.create({
        userId: teacherId,
        overrides: [{ kind: 'attempt_submitted', enabled: false }],
      });

      await expect(
        notifier.notifyAttemptSubmitted({ ...ATTEMPT_CONTEXT, userId: 'u1' }, NOW),
      ).resolves.toEqual({ recipients: 0 });
      expect(await notificationModel.countDocuments({})).toBe(0);
    });

    it('штата нет вовсе — recipients: 0, без похода за настройками', async () => {
      await expect(
        notifier.notifyAttemptSubmitted({ ...ATTEMPT_CONTEXT, userId: 'u1' }, NOW),
      ).resolves.toEqual({ recipients: 0 });
    });

    it('повторный вызов (второй тик) не плодит вторую строку — упор в уникальный индекс', async () => {
      await createUser('Мария', ['teacher']);

      await notifier.notifyAttemptSubmitted({ ...ATTEMPT_CONTEXT, userId: 'u1' }, NOW);
      await notifier.notifyAttemptSubmitted({ ...ATTEMPT_CONTEXT, userId: 'u1' }, NOW);

      expect(await notificationModel.countDocuments({})).toBe(1);
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
    it('ученик существует, вид включён (дефолт) — запись легла с outcome', async () => {
      const studentId = await createUser('Ученик', []);

      const result = await notifier.notifyExamGraded(
        { ...ATTEMPT_CONTEXT, userId: studentId, outcome: 'passed', comment: undefined },
        NOW,
      );

      expect(result).toEqual({ recipients: 1 });
      const stored = await notificationModel.findOne({ userId: studentId }).lean();
      expect(stored).toMatchObject({
        kind: 'exam_result',
        outcome: 'passed',
        readAt: null,
      });
    });

    it('ученик выключил exam_result — запись не пишется', async () => {
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
      expect(await notificationModel.countDocuments({})).toBe(0);
    });

    it('человека с таким id нет (аккаунт удалён) — не падает, ничего не пишет', async () => {
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
    });

    it('переоценка — тот же outcome обновляется, гасит readAt в null, строка одна', async () => {
      const studentId = await createUser('Ученик', []);
      await notifier.notifyExamGraded(
        {
          ...ATTEMPT_CONTEXT,
          userId: studentId,
          outcome: 'needs_work',
          comment: undefined,
        },
        NOW,
      );
      // Ученик прочитал первую версию оценки.
      await notificationModel.updateOne(
        { userId: studentId },
        { $set: { readAt: NOW.toJSDate() } },
      );

      const result = await notifier.notifyExamGraded(
        { ...ATTEMPT_CONTEXT, userId: studentId, outcome: 'passed', comment: undefined },
        NOW,
      );

      expect(result).toEqual({ recipients: 1 });
      expect(await notificationModel.countDocuments({})).toBe(1);
      const stored = await notificationModel.findOne({ userId: studentId }).lean();
      expect(stored?.outcome).toBe('passed');
      expect(stored?.readAt).toBeNull();
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

    // Гонка двух конкурентных апсертов одной тройки (userId, kind, attemptId)
    // — findOneAndUpdate(upsert) сам иногда бросает E11000, даже когда
    // документ на самом деле уже есть (создан параллельным вызовом ровно в
    // этот момент, комментарий у write() в in-app-exam-notifier.ts). Строка
    // ниже создаётся напрямую — играет роль «уже вставил конкурент», —
    // первый апсерт мокается на E11000, catch обязан домести переоценку
    // простым $set по уже существующей строке, не потерять её и не бросить.
    it('гонка двух апсертов одной тройки — catch домести переоценку через $set, не бросает', async () => {
      const studentId = await createUser('Ученик', []);
      await notificationModel.create({
        userId: studentId,
        kind: 'exam_result',
        examId: ATTEMPT_CONTEXT.examId,
        attemptId: ATTEMPT_CONTEXT.attemptId,
        outcome: 'needs_work',
        readAt: NOW.toJSDate(),
      });
      const duplicateError = Object.assign(new Error('E11000 duplicate key'), {
        code: 11000,
      });
      const upsertSpy = jest
        .spyOn(notificationModel, 'findOneAndUpdate')
        .mockRejectedValueOnce(duplicateError);

      const result = await notifier.notifyExamGraded(
        { ...ATTEMPT_CONTEXT, userId: studentId, outcome: 'failed', comment: undefined },
        NOW,
      );

      expect(result).toEqual({ recipients: 1 });
      expect(await notificationModel.countDocuments({})).toBe(1);
      const stored = await notificationModel.findOne({ userId: studentId }).lean();
      expect(stored?.outcome).toBe('failed');
      expect(stored?.readAt).toBeNull();
      upsertSpy.mockRestore();
    });
  });
});
