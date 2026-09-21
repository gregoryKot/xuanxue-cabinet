// Уведомление учителю «ученик сдал работу» (attempt_submitted, слой 4.7,
// PLAN §11) — отдельный файл от exam-attempts.service.spec.ts/
// exam-attempts.time.spec.ts (файл-лимит спеков, тот же приём, что у
// telegram-teacher-notifier.*.spec.ts, CLAUDE.md «Файлы»). Против настоящей
// Mongo (CLAUDE.md «Тесты») — гонка двух конкурентных запросов на одной и
// той же попытке решается условным `findOneAndUpdate` в
// exam-attempt-lifecycle.ts/ExamAttemptsService.submit, не мок её не поймает.
import { DateTime } from 'luxon';
import type { UserLean } from '../users/users.service';
import {
  AUTHOR_ID,
  USER_A,
  clearAttemptsTest,
  setupAttemptsTest,
  type AttemptsTestContext,
} from './exam-attempts.test-support';

const NOW = DateTime.utc(2026, 9, 13, 10, 0, 0);

const STAFF_USER: UserLean = {
  id: 'staff',
  name: 'Учитель',
  roles: ['teacher'],
  status: 'active',
};

describe('ExamAttemptsService — уведомление attempt_submitted', () => {
  let ctx: AttemptsTestContext;

  beforeAll(async () => {
    ctx = await setupAttemptsTest();
  }, 60_000);

  afterAll(async () => {
    await ctx.memory.stop();
  });

  afterEach(async () => {
    await clearAttemptsTest(ctx);
  });

  async function createPublishedExam(timeLimitMin?: number) {
    const item = await ctx.examItemsService.create(
      { kind: 'text', prompt: 'x' },
      AUTHOR_ID,
    );
    await ctx.examItemsService.update(item.id, { status: 'published' }, NOW);
    const exam = await ctx.examsService.create(
      {
        title: 'Экзамен по третьей форме',
        blocks: [{ itemIds: [item.id] }],
        timeLimitMin,
      },
      AUTHOR_ID,
    );
    await ctx.examsService.update(exam.id, { status: 'published' });
    return exam.id;
  }

  it('обычная сдача — уведомление ушло ровно один раз, с верным контекстом', async () => {
    const examId = await createPublishedExam();
    const started = await ctx.service.start(examId, USER_A, NOW);

    await ctx.service.submit(started.id, USER_A, NOW);

    expect(ctx.examNotifier.notifyAttemptSubmitted).toHaveBeenCalledTimes(1);
    const [context] = ctx.examNotifier.notifyAttemptSubmitted.mock.calls[0] ?? [];
    expect(context).toMatchObject({
      attemptId: started.id,
      examId,
      examTitle: 'Экзамен по третьей форме',
      userId: USER_A,
    });
  });

  it('попытка уже сдана — повторный submit() бросает и не шлёт второе уведомление', async () => {
    const examId = await createPublishedExam();
    const started = await ctx.service.start(examId, USER_A, NOW);
    await ctx.service.submit(started.id, USER_A, NOW);

    await expect(ctx.service.submit(started.id, USER_A, NOW)).rejects.toThrow();

    expect(ctx.examNotifier.notifyAttemptSubmitted).toHaveBeenCalledTimes(1);
  });

  // Аудит 2026-09-21 (HIGH): раньше проигравший `null` от findOneAndUpdate
  // читал безусловно как «дедлайн истёк» и отклонялся — ученик с двух вкладок
  // видел ложную панику о потере ответа на успешно сданной попытке.
  // resolveSubmitConflict (exam-attempt-submit-outcome.ts) отличает эту гонку
  // от настоящего дедлайна: проигравшая вкладка идемпотентно получает тот же
  // DTO `submitted`, что и выигравшая, — «ровно одно уведомление на попытку»
  // (шапка exam-attempt-lifecycle.ts) держится тем, что проигравшая сторона
  // не шлёт своё уже вообще: оно ушло от выигравшей (тест выше — «обычная
  // сдача»).
  //
  // Настоящий Promise.all здесь ненадёжен: под нагрузкой хоста (соседние
  // параллельные тестовые прогоны) порядок планировщика иногда даёт первому
  // submit() полностью завершиться (включая запись) до того, как второй
  // прочитает попытку — тогда второй просто видит уже не-`in_progress` и
  // отклоняется, как при обычной повторной сдаче, а не как при гонке
  // findOneAndUpdate (проверено дважды: тест то падал на «оба не resolved»,
  // то на «не все resolved» в зависимости от нагрузки). Мок ниже вместо этого
  // САМ выполняет ту запись, что сделала бы выигравшая вкладка, и только
  // потом отдаёт `null` — то же состояние базы, что при настоящей гонке, без
  // зависимости от нагрузки хоста (CLAUDE.md «Тесты»: мигающих не бывает).
  it('гонка: проигравшая сторона submit() отдаёт тот же DTO submitted и не шлёт второе уведомление', async () => {
    const examId = await createPublishedExam();
    const started = await ctx.service.start(examId, USER_A, NOW);
    const originalFindOneAndUpdate = ctx.attemptModel.findOneAndUpdate.bind(
      ctx.attemptModel,
    );
    jest.spyOn(ctx.attemptModel, 'findOneAndUpdate').mockImplementationOnce(() => {
      const pending = (async () => {
        await originalFindOneAndUpdate(
          { _id: started.id, userId: USER_A, status: 'in_progress' },
          { $set: { status: 'submitted', submittedAt: NOW.toJSDate() } },
        );
        return null;
      })();
      return { lean: () => pending } as never;
    });

    await expect(ctx.service.submit(started.id, USER_A, NOW)).resolves.toMatchObject({
      status: 'submitted',
    });

    // Именно эта (проигравшая) сторона не добавляет уведомление — общий счёт
    // «ровно одно на попытку» держит выигравшая сторона, не смоделированная
    // здесь напрямую (её случай — тест «обычная сдача» выше).
    expect(ctx.examNotifier.notifyAttemptSubmitted).not.toHaveBeenCalled();
  });

  it('авто-закрытие по дедлайну (лениво, через saveAnswers) — уведомление ушло ровно один раз', async () => {
    const examId = await createPublishedExam(30);
    const started = await ctx.service.start(examId, USER_A, NOW);

    await expect(
      ctx.service.saveAnswers(
        started.id,
        USER_A,
        { answers: [] },
        NOW.plus({ minutes: 31 }),
      ),
    ).rejects.toThrow();

    expect(ctx.examNotifier.notifyAttemptSubmitted).toHaveBeenCalledTimes(1);
  });

  it('гонка двух конкурентных авто-закрытий по дедлайну (list() + submit()) — одно уведомление', async () => {
    const examId = await createPublishedExam(30);
    const started = await ctx.service.start(examId, USER_A, NOW);
    const afterDeadline = NOW.plus({ minutes: 45 });

    await Promise.allSettled([
      ctx.service.list({ examId }, STAFF_USER, afterDeadline),
      ctx.service.submit(started.id, USER_A, afterDeadline),
    ]);

    expect(ctx.examNotifier.notifyAttemptSubmitted).toHaveBeenCalledTimes(1);
  });

  it('попытка без лимита времени, дедлайна нет — авто-закрытия не бывает, уведомления не бывает', async () => {
    const examId = await createPublishedExam();
    const started = await ctx.service.start(examId, USER_A, NOW);

    await ctx.service.list({ examId }, STAFF_USER, NOW.plus({ days: 1 }));

    expect(ctx.examNotifier.notifyAttemptSubmitted).not.toHaveBeenCalled();
    expect(started.status).toBe('in_progress');
  });
});
