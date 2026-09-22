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
import { toNotificationDto, type RawLeanNotification } from './notification.mapper';
import { InAppExamNotifier } from './in-app-exam-notifier';
import { InAppVideoLinkNotifier } from './in-app-video-link-notifier';
import { InboxService } from './inbox.service';
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
  let videoLinkNotifier: InAppVideoLinkNotifier;

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
    // Соседний класс с теми же зависимостями (ADR-0084) — тестируется здесь
    // же, а не в своём файле: фикстура (Mongo в памяти, пользователи,
    // настройки видов) уже стоит тут, а её копия рядом была бы дублем на
    // полсотни строк (CLAUDE.md «Дубли»).
    videoLinkNotifier = new InAppVideoLinkNotifier(
      notificationModel,
      usersService,
      notificationPrefsService,
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

    // Регресс (находка при ревью «уведомление нельзя смахнуть, удалить»,
    // отзыв владельца 2026-09-22): апсерт writeNotificationRow гасит readAt
    // в null при каждой записи, но раньше не трогал dismissedAt — убранная
    // строка молча оставалась вне ленты при переоценке того же (userId,
    // kind, attemptId), и ученик не узнавал о новом результате. Новое
    // событие обязано вернуть строку в ленту: «убрано» относится к
    // прошлому событию, не к строке навсегда.
    it('убрали уведомление, потом переоценка той же попытки — строка снова в ленте и непрочитана', async () => {
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
      const inbox = new InboxService(notificationModel);
      const before = await notificationModel.findOne({ userId: studentId }).lean();
      if (!before) throw new Error('запись не легла — проверять нечего');
      await inbox.dismiss(studentId, before._id.toString(), NOW);
      await expect(inbox.list(studentId, {})).resolves.toEqual({
        items: [],
        unreadCount: 0,
      });

      await notifier.notifyExamGraded(
        { ...ATTEMPT_CONTEXT, userId: studentId, outcome: 'passed', comment: undefined },
        NOW,
      );

      const page = await inbox.list(studentId, {});
      expect(page.items).toHaveLength(1);
      expect(page.items[0]?.outcome).toBe('passed');
      expect(page.unreadCount).toBe(1);
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

  // ADR-0084: собственного вида не заводим, переиспользуем attempt_submitted
  // (комментарий у notifyVideoLinkAdded, in-app-exam-notifier.ts) —
  // получатели те же, что у notifyAttemptSubmitted.
  describe('notifyVideoLinkAdded', () => {
    const VIDEO_LINK_CONTEXT = {
      ...ATTEMPT_CONTEXT,
      userId: 'u1',
      questionPrompt: 'Повторите форму Ци-ши',
      url: 'https://vk.com/video-1',
    };

    it('учитель активен, вид включён (дефолт роли) — запись легла под attempt_submitted', async () => {
      const teacherId = await createUser('Мария', ['teacher']);

      await videoLinkNotifier.notifyVideoLinkAdded(VIDEO_LINK_CONTEXT, NOW);

      const stored = await notificationModel.findOne({ userId: teacherId }).lean();
      expect(stored).toMatchObject({
        userId: teacherId,
        kind: 'attempt_submitted',
        examId: ATTEMPT_CONTEXT.examId,
        attemptId: ATTEMPT_CONTEXT.attemptId,
        readAt: null,
      });
    });

    it('учитель выключил attempt_submitted — запись не пишется', async () => {
      const teacherId = await createUser('Мария', ['teacher']);
      await notificationPrefsModel.create({
        userId: teacherId,
        overrides: [{ kind: 'attempt_submitted', enabled: false }],
      });

      await videoLinkNotifier.notifyVideoLinkAdded(VIDEO_LINK_CONTEXT, NOW);

      expect(await notificationModel.countDocuments({})).toBe(0);
    });

    it('штата нет вовсе — ничего не пишет, не падает', async () => {
      await expect(
        videoLinkNotifier.notifyVideoLinkAdded(VIDEO_LINK_CONTEXT, NOW),
      ).resolves.toBeUndefined();
    });

    it('сбой резолва (Mongo упала) — не бросает, warn-лог, не error', async () => {
      const boom = jest
        .spyOn(usersService, 'listActiveWithRoles')
        .mockRejectedValue(new Error('Mongo недоступна'));
      const warn = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);

      await expect(
        videoLinkNotifier.notifyVideoLinkAdded(VIDEO_LINK_CONTEXT, NOW),
      ).resolves.toBeUndefined();

      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('Mongo недоступна'),
        expect.objectContaining({ attemptId: ATTEMPT_CONTEXT.attemptId }),
      );
      boom.mockRestore();
      warn.mockRestore();
    });
  });

  // Название формы — единственное `enc`-поле записи, и путь у него длинный:
  // шифрует нотификатор (encryptRecord), расшифровывает маппер
  // (decryptRecord), а видно его только внутри собранной строки `text`.
  // Рассогласование схем шифрования не уронило бы ни один тест выше — они
  // название не читают вовсе, — поэтому проверяем весь путь целиком.
  describe('название формы переживает шифрование', () => {
    it('запись → чтение маппером: название внутри text', async () => {
      const studentId = await createUser('Ученик', []);

      await notifier.notifyExamGraded(
        { ...ATTEMPT_CONTEXT, userId: studentId, outcome: 'passed', comment: undefined },
        NOW,
      );

      const stored = await notificationModel
        .findOne({ userId: studentId })
        .lean<RawLeanNotification | null>();
      if (!stored) throw new Error('запись не легла — проверять нечего');
      expect(toNotificationDto(stored).text).toBe(
        `Работу проверили — ${ATTEMPT_CONTEXT.examTitle}`,
      );
    });

    // Без этой проверки симметричная ошибка (не шифруем и не расшифровываем)
    // прошла бы мимо теста выше: строка собралась бы верно, а в базе лежало
    // бы открытое название, которое писал учитель.
    it('в базе лежит шифротекст, не открытое название', async () => {
      const studentId = await createUser('Ученик', []);

      await notifier.notifyExamGraded(
        { ...ATTEMPT_CONTEXT, userId: studentId, outcome: 'passed', comment: undefined },
        NOW,
      );

      const stored = await notificationModel.findOne({ userId: studentId }).lean();
      expect(stored?.examTitle).toBeDefined();
      expect(stored?.examTitle).not.toBe(ATTEMPT_CONTEXT.examTitle);
    });
  });
});
