// Против настоящей Mongo (mongodb-memory-server, не мок — CLAUDE.md «Тесты»):
// срок хранения попыток экзамена (ADR-0153, PLAN §11 «Данные»). Время — только
// явный `now` (Luxon), границы считаются от EXAM_ATTEMPT_RETENTION_YEARS, а не
// от литерала «3»: тест держит связь шага с общей константой (её же называет
// политика конфиденциальности). Общий подъём — exam-attempts.test-support.ts.
import { DateTime } from 'luxon';
import { Types } from 'mongoose';
import { EXAM_ATTEMPT_RETENTION_YEARS, type ExamAttemptStatus } from '@xuanxue/shared';
import {
  AUTHOR_ID,
  GRADER_ID,
  USER_A,
  USER_B,
  clearAttemptsTest,
  setupAttemptsTest,
  type AttemptsTestContext,
} from './exam-attempts.test-support';
import { ExamAttemptRetentionSweepService } from './exam-attempt-retention-sweep.service';

const NOW = DateTime.utc(2026, 9, 29, 12, 0, 0);
const BOUNDARY = NOW.minus({ years: EXAM_ATTEMPT_RETENTION_YEARS });
// Секунда — самый мелкий шаг, который различает граница: `$lt` строгий.
const JUST_OLDER = BOUNDARY.minus({ seconds: 1 });
const JUST_YOUNGER = BOUNDARY.plus({ seconds: 1 });
const SWEEP_BATCH_LIMIT = 50;

describe('ExamAttemptRetentionSweepService', () => {
  let ctx: AttemptsTestContext;
  let sweep: ExamAttemptRetentionSweepService;

  beforeAll(async () => {
    ctx = await setupAttemptsTest();
    sweep = new ExamAttemptRetentionSweepService(
      ctx.attemptModel,
      ctx.gradingModel,
      ctx.mediaModel,
      ctx.notificationModel,
    );
  }, 60_000);

  afterAll(async () => {
    await ctx.memory.stop();
  });

  afterEach(async () => {
    await clearAttemptsTest(ctx);
  });

  interface AttemptSpec {
    status: ExamAttemptStatus;
    userId?: string;
    submittedAt?: DateTime;
    updatedAt?: DateTime;
    expired?: boolean;
  }

  // Напрямую в коллекцию, мимо Mongoose: иначе timestamps: true перепишет
  // updatedAt на настоящие часы, а срок «в работе» считается именно по нему.
  async function insertAttempt(spec: AttemptSpec): Promise<Types.ObjectId> {
    const _id = new Types.ObjectId();
    const at = (spec.updatedAt ?? spec.submittedAt ?? NOW).toJSDate();
    await ctx.attemptModel.collection.insertOne({
      _id,
      examId: new Types.ObjectId(),
      examTitle: 'Экзамен',
      userId: new Types.ObjectId(spec.userId ?? USER_A),
      attemptNo: 1,
      status: spec.status,
      blocks: '[]',
      answers: '[]',
      imageIds: [],
      videoIds: [],
      startedAt: JUST_OLDER.minus({ days: 400 }).toJSDate(),
      expired: spec.expired ?? false,
      ...(spec.submittedAt ? { submittedAt: spec.submittedAt.toJSDate() } : {}),
      createdAt: at,
      updatedAt: at,
    });
    return _id;
  }

  async function addDependents(
    attemptId: Types.ObjectId,
    gradedAt?: DateTime,
  ): Promise<void> {
    const userId = new Types.ObjectId(USER_A);
    if (gradedAt) {
      await ctx.gradingModel.create({
        attemptId,
        examId: new Types.ObjectId(),
        userId,
        graderId: new Types.ObjectId(GRADER_ID),
        outcome: 'passed',
        gradedAt: gradedAt.toJSDate(),
      });
    }
    await ctx.mediaModel.create({
      attemptId,
      userId,
      kind: 'manual',
      receivedAt: NOW.toJSDate(),
    });
    await ctx.notificationModel.create({
      userId: AUTHOR_ID,
      kind: 'attempt_submitted',
      attemptId: attemptId.toString(),
      readAt: null,
      dismissedAt: null,
    });
  }

  async function dependentsLeft(attemptId: Types.ObjectId) {
    return {
      gradings: await ctx.gradingModel.countDocuments({ attemptId }),
      media: await ctx.mediaModel.countDocuments({ attemptId }),
      notifications: await ctx.notificationModel.countDocuments({
        attemptId: attemptId.toString(),
      }),
    };
  }

  const NOTHING_LEFT = { gradings: 0, media: 0, notifications: 0 };

  describe('проверенная попытка: результат — время оценки', () => {
    it('оценка старше срока — уходит попытка, оценка, видео и уведомление', async () => {
      const old = await insertAttempt({ status: 'graded', submittedAt: JUST_OLDER });
      await addDependents(old, JUST_OLDER);
      // Контроль: оценка моложе срока, у другого ученика — не задета.
      const young = await insertAttempt({
        status: 'graded',
        userId: USER_B,
        submittedAt: JUST_OLDER,
      });
      await addDependents(young, JUST_YOUNGER);

      await expect(sweep.removeExpired(NOW)).resolves.toEqual({ removed: 1 });

      await expect(ctx.attemptModel.findById(old)).resolves.toBeNull();
      await expect(dependentsLeft(old)).resolves.toEqual(NOTHING_LEFT);
      await expect(ctx.attemptModel.findById(young)).resolves.not.toBeNull();
      await expect(dependentsLeft(young)).resolves.toEqual({
        gradings: 1,
        media: 1,
        notifications: 1,
      });
    });

    it('оценка ровно на границе срока ещё живёт, на секунду старше — уже нет', async () => {
      const onBoundary = await insertAttempt({ status: 'graded' });
      await addDependents(onBoundary, BOUNDARY);
      const older = await insertAttempt({ status: 'graded' });
      await addDependents(older, JUST_OLDER);

      await expect(sweep.removeExpired(NOW)).resolves.toEqual({ removed: 1 });

      await expect(ctx.attemptModel.findById(onBoundary)).resolves.not.toBeNull();
      await expect(ctx.attemptModel.findById(older)).resolves.toBeNull();
    });

    it('переоценка сдвигает срок: сдана давно, но оценена заново недавно — остаётся', async () => {
      const regraded = await insertAttempt({
        status: 'graded',
        submittedAt: BOUNDARY.minus({ years: 1 }),
      });
      await addDependents(regraded, JUST_YOUNGER);

      await expect(sweep.removeExpired(NOW)).resolves.toEqual({ removed: 0 });

      await expect(ctx.attemptModel.findById(regraded)).resolves.not.toBeNull();
      await expect(dependentsLeft(regraded)).resolves.toEqual({
        gradings: 1,
        media: 1,
        notifications: 1,
      });
    });
  });

  describe('сданная и не проверенная попытка: результат — время сдачи', () => {
    it('сдана раньше срока — уходит вместе с видео и уведомлением, моложе — остаётся', async () => {
      const old = await insertAttempt({ status: 'submitted', submittedAt: JUST_OLDER });
      await addDependents(old);
      const young = await insertAttempt({
        status: 'submitted',
        submittedAt: JUST_YOUNGER,
      });
      await addDependents(young);

      await expect(sweep.removeExpired(NOW)).resolves.toEqual({ removed: 1 });

      await expect(ctx.attemptModel.findById(old)).resolves.toBeNull();
      await expect(dependentsLeft(old)).resolves.toEqual(NOTHING_LEFT);
      await expect(ctx.attemptModel.findById(young)).resolves.not.toBeNull();
      await expect(dependentsLeft(young)).resolves.toEqual({
        gradings: 0,
        media: 1,
        notifications: 1,
      });
    });

    it('сдана ровно на границе — живёт; сдана по времени (expired) на секунду старше — уходит', async () => {
      const onBoundary = await insertAttempt({
        status: 'submitted',
        submittedAt: BOUNDARY,
      });
      const byTime = await insertAttempt({
        status: 'submitted',
        submittedAt: JUST_OLDER,
        expired: true,
      });

      await expect(sweep.removeExpired(NOW)).resolves.toEqual({ removed: 1 });

      await expect(ctx.attemptModel.findById(onBoundary)).resolves.not.toBeNull();
      await expect(ctx.attemptModel.findById(byTime)).resolves.toBeNull();
    });
  });

  describe('попытка в работе: результата нет, срок — от последней правки', () => {
    it('не правили дольше срока — уходит; правили недавно — остаётся, сколько бы ни шла', async () => {
      const abandoned = await insertAttempt({
        status: 'in_progress',
        updatedAt: JUST_OLDER,
      });
      await addDependents(abandoned);
      // startedAt у обеих — старше срока (insertAttempt), но эту дописывали
      // «вчера»: автосохранение двигает updatedAt.
      const active = await insertAttempt({
        status: 'in_progress',
        updatedAt: JUST_YOUNGER,
      });

      await expect(sweep.removeExpired(NOW)).resolves.toEqual({ removed: 1 });

      await expect(ctx.attemptModel.findById(abandoned)).resolves.toBeNull();
      await expect(dependentsLeft(abandoned)).resolves.toEqual(NOTHING_LEFT);
      await expect(ctx.attemptModel.findById(active)).resolves.not.toBeNull();
    });

    it('правка ровно на границе срока ещё держит попытку', async () => {
      const onBoundary = await insertAttempt({
        status: 'in_progress',
        updatedAt: BOUNDARY,
      });

      await expect(sweep.removeExpired(NOW)).resolves.toEqual({ removed: 0 });

      await expect(ctx.attemptModel.findById(onBoundary)).resolves.not.toBeNull();
    });
  });

  describe('граница и пачка', () => {
    it('граница считается календарными годами в UTC, а не в поясе, в котором пришёл now', async () => {
      // 26 марта 2026 в Иерусалиме ещё зима (+02:00), а 26 марта 2023-го уже лето
      // (+03:00): «минус три года» в поясе школы дало бы границу на час раньше.
      const nowInSchoolZone = DateTime.fromISO('2026-03-26T12:00:00', {
        zone: 'Asia/Jerusalem',
      });
      expect(nowInSchoolZone.minus({ years: 3 }).toUTC().toISO()).toBe(
        '2023-03-26T09:00:00.000Z',
      );
      const inTheGap = await insertAttempt({
        status: 'submitted',
        submittedAt: DateTime.utc(2023, 3, 26, 9, 30),
      });
      const after = await insertAttempt({
        status: 'submitted',
        submittedAt: DateTime.utc(2023, 3, 26, 10, 30),
      });

      await expect(sweep.removeExpired(nowInSchoolZone)).resolves.toEqual({ removed: 1 });

      // Граница по UTC — 10:00Z: работа в 09:30Z старше неё, в 10:30Z — моложе.
      await expect(ctx.attemptModel.findById(inTheGap)).resolves.toBeNull();
      await expect(ctx.attemptModel.findById(after)).resolves.not.toBeNull();
    });

    it('за проход уходит не больше пачки, остаток добирает следующий тик', async () => {
      for (let i = 0; i < SWEEP_BATCH_LIMIT + 1; i += 1) {
        await insertAttempt({ status: 'submitted', submittedAt: JUST_OLDER });
      }

      await expect(sweep.removeExpired(NOW)).resolves.toEqual({
        removed: SWEEP_BATCH_LIMIT,
      });
      await expect(ctx.attemptModel.countDocuments()).resolves.toBe(1);

      await expect(sweep.removeExpired(NOW)).resolves.toEqual({ removed: 1 });
      await expect(ctx.attemptModel.countDocuments()).resolves.toBe(0);
    });

    it('повторный проход ничего не находит', async () => {
      const old = await insertAttempt({ status: 'submitted', submittedAt: JUST_OLDER });
      await addDependents(old);

      await sweep.removeExpired(NOW);

      await expect(sweep.removeExpired(NOW)).resolves.toEqual({ removed: 0 });
    });

    it('пустая база — ноль, не ошибка', async () => {
      await expect(sweep.removeExpired(NOW)).resolves.toEqual({ removed: 0 });
    });
  });

  describe('сбой посреди прошлого прохода', () => {
    it('оценка осталась без попытки — дочищается, а не находится каждый тик заново', async () => {
      const gone = new Types.ObjectId();
      await ctx.gradingModel.create({
        attemptId: gone,
        examId: new Types.ObjectId(),
        userId: new Types.ObjectId(USER_A),
        graderId: new Types.ObjectId(GRADER_ID),
        outcome: 'failed',
        gradedAt: JUST_OLDER.toJSDate(),
      });

      // Попыток удалено 0 — счётчик считает попытки, — но оценка ушла.
      await expect(sweep.removeExpired(NOW)).resolves.toEqual({ removed: 0 });
      await expect(ctx.gradingModel.countDocuments({ attemptId: gone })).resolves.toBe(0);
    });
  });

  // Read-after-write: пишем через настоящие сервисы попытки, читаем тоже через
  // них — уборка не должна ломать то, что видит ученик потом.
  describe('через настоящие сервисы', () => {
    async function createPublishedExam(attemptsAllowed: number): Promise<string> {
      const item = await ctx.examItemsService.create(
        { kind: 'text', prompt: 'Опишите форму «пэнбу»' },
        AUTHOR_ID,
      );
      await ctx.examItemsService.update(item.id, { status: 'published' }, BOUNDARY);
      const exam = await ctx.examsService.create(
        { title: 'Экзамен', blocks: [{ itemIds: [item.id] }], attemptsAllowed },
        AUTHOR_ID,
      );
      await ctx.examsService.update(exam.id, { status: 'published' }, NOW);
      return exam.id;
    }

    it('оценённая три года назад попытка уходит целиком, и счётчик попыток ученика начинается заново', async () => {
      const examId = await createPublishedExam(1);
      const started = await ctx.service.start(examId, USER_A, JUST_OLDER);
      await ctx.service.submit(started.id, USER_A, JUST_OLDER);
      await ctx.gradingsService.grade(
        started.id,
        GRADER_ID,
        { outcome: 'passed', comment: 'Хорошо' },
        JUST_OLDER,
      );
      // Лимит в одну попытку исчерпан — пока история жива.
      await expect(ctx.service.start(examId, USER_A, NOW)).rejects.toThrow();

      await expect(sweep.removeExpired(NOW)).resolves.toEqual({ removed: 1 });

      await expect(ctx.attemptModel.countDocuments({ userId: USER_A })).resolves.toBe(0);
      await expect(
        ctx.gradingModel.countDocuments({ attemptId: started.id }),
      ).resolves.toBe(0);
      // Истории, по которой считался лимит, больше нет: экзамен открывается заново.
      await expect(ctx.service.start(examId, USER_A, NOW)).resolves.toMatchObject({
        status: 'in_progress',
      });
    });
  });
});
