// ADR-0140 — мягкое удаление формы и вопроса банка, сквозные сценарии через
// настоящие сервисы (mongodb-memory-server, CLAUDE.md «Тесты»): каждый
// отдельный кусок уже проверен в exams.service.spec.ts/exam-items.service.
// spec.ts/exam-attempts.service.spec.ts/my-exams.service.spec.ts — здесь
// read-after-write через несколько сервисов разом, как его описал владелец
// («учителю не мешало»): удалили форму — она пропала везде разом; удалили
// вопрос — он пропал из банка, но форма и попытка продолжают его видеть.
import { DateTime } from 'luxon';
import type { UserLean } from '../users/users.service';
import {
  AUTHOR_ID,
  USER_A,
  clearAttemptsTest,
  setupAttemptsTest,
  type AttemptsTestContext,
} from './exam-attempts.test-support';
import { MyExamsService } from './my-exams.service';

const STAFF: UserLean = {
  id: '507f1f77bcf86cd799439099',
  name: 'Штат',
  roles: ['teacher'],
  status: 'active',
};

const NOW = DateTime.utc(2026, 9, 27, 12, 0, 0);

describe('Мягкое удаление экзамена и вопроса (ADR-0140)', () => {
  let ctx: AttemptsTestContext;
  let myExamsService: MyExamsService;

  beforeAll(async () => {
    ctx = await setupAttemptsTest();
    myExamsService = new MyExamsService(
      ctx.examModel,
      ctx.attemptModel,
      ctx.gradingModel,
      ctx.seenMarkModel,
      ctx.examNotifier,
      ctx.examsService,
    );
  }, 60_000);

  afterAll(async () => {
    await ctx.memory.stop();
  });

  afterEach(async () => {
    await clearAttemptsTest(ctx);
  });

  async function publishedItemAndExam(): Promise<{ itemId: string; examId: string }> {
    const item = await ctx.examItemsService.create(
      { kind: 'text', prompt: 'Опишите стойку «мабу»' },
      AUTHOR_ID,
    );
    await ctx.examItemsService.update(item.id, { status: 'published' }, NOW);
    const exam = await ctx.examsService.create(
      { title: 'Экзамен по стойкам', blocks: [{ itemIds: [item.id] }] },
      AUTHOR_ID,
    );
    await ctx.examsService.update(exam.id, { status: 'published' });
    return { itemId: item.id, examId: exam.id };
  }

  it('удалённая форма пропадает у учителя, у ученика и из списка попыток разом', async () => {
    const { examId } = await publishedItemAndExam();
    const student: UserLean = { id: USER_A, name: 'Ученик', roles: [], status: 'active' };
    await ctx.service.start(examId, USER_A, NOW);

    await ctx.examsService.remove(examId, NOW);

    await expect(ctx.examsService.getById(examId)).rejects.toThrow('не найден');
    expect((await ctx.examsService.list({})).some((e) => e.id === examId)).toBe(false);
    expect(
      (await myExamsService.list({}, USER_A, NOW)).some((e) => e.id === examId),
    ).toBe(false);
    const staffView = await ctx.service.list({}, STAFF, NOW);
    const studentView = await ctx.service.list({}, student, NOW);
    expect(staffView.some((a) => a.examId === examId)).toBe(false);
    expect(studentView.some((a) => a.examId === examId)).toBe(false);
    await expect(ctx.service.start(examId, USER_A, NOW)).rejects.toThrow('не найден');
  });

  it('удалённый вопрос пропадает из банка, но форма и попытка продолжают его видеть', async () => {
    const { itemId, examId } = await publishedItemAndExam();

    await ctx.examItemsService.remove(itemId, NOW);

    expect((await ctx.examItemsService.list({})).some((i) => i.id === itemId)).toBe(
      false,
    );
    await expect(ctx.examItemsService.getById(itemId)).rejects.toThrow('не найден');
    const withDeleted = await ctx.examItemsService.list({ includeDeleted: true });
    const deletedDto = withDeleted.find((i) => i.id === itemId);
    expect(deletedDto?.deletedAt).toBe(NOW.toUTC().toISO());

    // Форма продолжает сохраняться — блок ссылается на удалённый вопрос.
    const updated = await ctx.examsService.update(examId, { level: 'начальный' });
    expect(updated.blocks[0]?.itemIds).toEqual([itemId]);

    // Ученик всё ещё получает этот вопрос при старте попытки.
    const started = await ctx.service.start(examId, USER_A, NOW);
    const questionIds = started.blocks.flatMap((b) => b.questions.map((q) => q.itemId));
    expect(questionIds).toEqual([itemId]);
  });
});
