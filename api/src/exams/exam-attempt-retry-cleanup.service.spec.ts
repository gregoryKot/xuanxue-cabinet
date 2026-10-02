// Против настоящей Mongo (mongodb-memory-server, не мок — CLAUDE.md
// «Тесты»): удаление просроченной непроверенной попытки, её видео и
// уведомлений учителя, сохранность проверенной (`graded`) истории (ADR-0131,
// отзыв тестировщицы 2026-09-23, п.4). Общий подъём сервисов —
// exam-attempts.test-support.ts.
import { DateTime } from 'luxon';
import { Types } from 'mongoose';
import {
  AUTHOR_ID,
  USER_A,
  clearAttemptsTest,
  setupAttemptsTest,
  type AttemptsTestContext,
} from './exam-attempts.test-support';
import { ExamAttemptRetryCleanupService } from './exam-attempt-retry-cleanup.service';

const NOW = DateTime.utc(2026, 9, 23, 9, 0, 0);

describe('ExamAttemptRetryCleanupService', () => {
  let ctx: AttemptsTestContext;
  let retryCleanup: ExamAttemptRetryCleanupService;

  beforeAll(async () => {
    ctx = await setupAttemptsTest();
    retryCleanup = new ExamAttemptRetryCleanupService(
      ctx.attemptModel,
      ctx.mediaModel,
      ctx.notificationModel,
      ctx.gradingModel,
    );
  }, 60_000);

  afterAll(async () => {
    await ctx.memory.stop();
  });

  afterEach(async () => {
    await clearAttemptsTest(ctx);
  });

  async function createPublishedExam(): Promise<string> {
    const item = await ctx.examItemsService.create(
      { kind: 'text', prompt: 'Опишите форму «пэнбу»' },
      AUTHOR_ID,
    );
    await ctx.examItemsService.update(item.id, { status: 'published' }, NOW);
    const exam = await ctx.examsService.create(
      { title: 'Экзамен', blocks: [{ itemIds: [item.id] }], attemptsAllowed: 3 },
      AUTHOR_ID,
    );
    await ctx.examsService.update(exam.id, { status: 'published' }, NOW);
    return exam.id;
  }

  describe('findLastAttempt', () => {
    it('попыток ещё не было — null', async () => {
      const examId = await createPublishedExam();
      await expect(retryCleanup.findLastAttempt(examId, USER_A)).resolves.toBeNull();
    });

    it('несколько попыток — отдаёт с наибольшим attemptNo', async () => {
      const examId = await createPublishedExam();
      const first = await ctx.service.start(examId, USER_A, NOW);
      await ctx.service.submit(first.id, USER_A, NOW);
      await ctx.attemptModel.updateOne({ _id: first.id }, { $set: { expired: true } });
      const second = await ctx.service.start(examId, USER_A, NOW.plus({ minutes: 1 }));

      const last = await retryCleanup.findLastAttempt(examId, USER_A);
      expect(last?._id.toString()).toBe(second.id);
      expect(last?.attemptNo).toBe(2);
    });
  });

  describe('deleteIfExpiredUngraded', () => {
    async function makeSubmittedExpiredAttempt() {
      const examId = await createPublishedExam();
      const started = await ctx.service.start(examId, USER_A, NOW);
      await ctx.attemptModel.updateOne(
        { _id: started.id },
        { $set: { status: 'submitted', expired: true, submittedAt: NOW.toJSDate() } },
      );
      return started.id;
    }

    it('удаляет попытку, сданную по истечении времени и не проверенную', async () => {
      const attemptId = await makeSubmittedExpiredAttempt();
      const last = await retryCleanup.findLastAttempt(
        (await ctx.attemptModel.findById(attemptId).lean())?.examId.toString() ?? '',
        USER_A,
      );
      if (!last) throw new Error('попытка не найдена');

      await retryCleanup.deleteIfExpiredUngraded(last);

      await expect(ctx.attemptModel.findById(attemptId)).resolves.toBeNull();
    });

    it('вместе с попыткой удаляются её видео (media_assets)', async () => {
      const attemptId = await makeSubmittedExpiredAttempt();
      await ctx.mediaModel.create({
        attemptId: new Types.ObjectId(attemptId),
        userId: new Types.ObjectId(USER_A),
        kind: 'manual',
        receivedAt: NOW.toJSDate(),
      });
      const examId = (
        await ctx.attemptModel.findById(attemptId).lean()
      )?.examId.toString();
      const last = await retryCleanup.findLastAttempt(examId ?? '', USER_A);
      if (!last) throw new Error('попытка не найдена');

      await retryCleanup.deleteIfExpiredUngraded(last);

      await expect(
        ctx.mediaModel.countDocuments({ attemptId: new Types.ObjectId(attemptId) }),
      ).resolves.toBe(0);
    });

    it('вместе с попыткой удаляются уведомления учителя об этой попытке (ADR-0113: /grading/:id не должен вести в 404)', async () => {
      const attemptId = await makeSubmittedExpiredAttempt();
      await ctx.notificationModel.create({
        userId: AUTHOR_ID,
        kind: 'attempt_submitted',
        attemptId,
        readAt: null,
        dismissedAt: null,
      });
      const examId = (
        await ctx.attemptModel.findById(attemptId).lean()
      )?.examId.toString();
      const last = await retryCleanup.findLastAttempt(examId ?? '', USER_A);
      if (!last) throw new Error('попытка не найдена');

      await retryCleanup.deleteIfExpiredUngraded(last);

      await expect(ctx.notificationModel.countDocuments({ attemptId })).resolves.toBe(0);
    });

    it('проверенную (graded) попытку не трогает — история оценки остаётся', async () => {
      const examId = await createPublishedExam();
      const started = await ctx.service.start(examId, USER_A, NOW);
      await ctx.service.submit(started.id, USER_A, NOW);
      await ctx.gradingsService.grade(started.id, AUTHOR_ID, { outcome: 'passed' }, NOW);
      const last = await retryCleanup.findLastAttempt(examId, USER_A);
      if (!last) throw new Error('попытка не найдена');
      expect(last.status).toBe('graded');

      await retryCleanup.deleteIfExpiredUngraded(last);

      await expect(ctx.attemptModel.findById(started.id)).resolves.not.toBeNull();
    });

    it('попытку, сданную самим учеником (не по времени) — не трогает', async () => {
      const examId = await createPublishedExam();
      const started = await ctx.service.start(examId, USER_A, NOW);
      await ctx.service.submit(started.id, USER_A, NOW);
      const last = await retryCleanup.findLastAttempt(examId, USER_A);
      if (!last) throw new Error('попытка не найдена');

      await retryCleanup.deleteIfExpiredUngraded(last);

      await expect(ctx.attemptModel.findById(started.id)).resolves.not.toBeNull();
    });

    it('идемпотентно — повторный вызов с тем же снимком ничего не ломает', async () => {
      const attemptId = await makeSubmittedExpiredAttempt();
      const examId = (
        await ctx.attemptModel.findById(attemptId).lean()
      )?.examId.toString();
      const last = await retryCleanup.findLastAttempt(examId ?? '', USER_A);
      if (!last) throw new Error('попытка не найдена');

      await retryCleanup.deleteIfExpiredUngraded(last);
      await expect(retryCleanup.deleteIfExpiredUngraded(last)).resolves.toBeUndefined();
    });
  });
});
