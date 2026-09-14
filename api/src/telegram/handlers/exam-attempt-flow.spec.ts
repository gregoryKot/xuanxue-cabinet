// Против настоящей Mongo (mongodb-memory-server, не мок — CLAUDE.md «Тесты»):
// бот — второй клиент ExamAttemptsService/MyExamsService (ADR-0024) через
// ExamBotService (реализация ExamBotPort). Read-after-write: ответ,
// сохранённый из бота, виден в следующем рендере того же вопроса; чужая
// попытка не отвечает (SECURITY §3).
import { DateTime } from 'luxon';
import type { Context } from 'telegraf';
import type { UserLean } from '../../users/users.service';
import { ExamBotPortRegistry } from '../exam-bot-port.registry';
import { ExamBotService } from '../../exams/exam-bot.service';
import { MyExamsService } from '../../exams/my-exams.service';
import {
  AUTHOR_ID,
  USER_A,
  USER_B,
  clearAttemptsTest,
  setupAttemptsTest,
  type AttemptsTestContext,
} from '../../exams/exam-attempts.test-support';
import { handleExamOption, handleExamSubmit } from './exam-attempt-answer';
import { handleExamQuestion, handleExamStart } from './exam-attempt-navigation';

const NOW = DateTime.utc(2026, 9, 12, 10, 0, 0);

function user(id: string): UserLean {
  return { id, name: 'Ученик', roles: [], tz: 'Asia/Jerusalem', status: 'active' };
}

function fakeCtx(): { ctx: Context; edits: string[]; buttonTexts: string[][] } {
  const edits: string[] = [];
  const buttonTexts: string[][] = [];
  const ctx = {
    editMessageText: (
      text: string,
      extra?: { reply_markup?: { inline_keyboard?: { text: string }[][] } },
    ) => {
      edits.push(text);
      buttonTexts.push(
        (extra?.reply_markup?.inline_keyboard ?? []).flat().map((b) => b.text),
      );
      return Promise.resolve(true);
    },
  } as unknown as Context;
  return { ctx, edits, buttonTexts };
}

describe('бот — второй клиент ExamAttemptsService (интеграция, Mongo)', () => {
  let ctx: AttemptsTestContext;
  let examBot: ExamBotService;

  beforeAll(async () => {
    ctx = await setupAttemptsTest();
    const myExamsService = new MyExamsService(
      ctx.examModel,
      ctx.attemptModel,
      ctx.gradingModel,
      ctx.examNotifier,
    );
    examBot = new ExamBotService(myExamsService, ctx.service, new ExamBotPortRegistry());
  }, 60_000);

  afterAll(async () => {
    await ctx.memory.stop();
  });

  afterEach(async () => {
    await clearAttemptsTest(ctx);
  });

  async function publishedSingleChoiceExam(): Promise<string> {
    const item = await ctx.examItemsService.create(
      {
        kind: 'single',
        prompt: 'Сколько форм в третьем уровне?',
        options: [
          { text: 'Три', correct: true },
          { text: 'Пять', correct: false },
        ],
      },
      AUTHOR_ID,
    );
    await ctx.examItemsService.update(item.id, { status: 'published' }, NOW);
    const exam = await ctx.examsService.create(
      { title: 'Форма третьего уровня', blocks: [{ title: '', itemIds: [item.id] }] },
      AUTHOR_ID,
    );
    await ctx.examsService.update(exam.id, { status: 'published' });
    return exam.id;
  }

  it('ExamBotService.listMyExams — то же, что видит кабинет ученика', async () => {
    const examId = await publishedSingleChoiceExam();
    await handleExamStart(fakeCtx().ctx, examBot, user(USER_A), examId, NOW);

    const exams = await examBot.listMyExams(user(USER_A), NOW);

    expect(exams).toHaveLength(1);
    expect(exams[0]?.lastAttempt?.status).toBe('in_progress');
  });

  it('ответ, сохранённый из бота, виден в попытке при следующем рендере (read-after-write)', async () => {
    const examId = await publishedSingleChoiceExam();
    const start = fakeCtx();
    await handleExamStart(start.ctx, examBot, user(USER_A), examId, NOW);
    expect(start.edits[0]).toContain('Вопрос 1 из 1');
    expect(start.edits[0]).not.toContain('✓');

    const attempts = await ctx.service.list({}, { ...user(USER_A) }, NOW);
    const attemptId = attempts[0]?.id;
    expect(attemptId).toBeDefined();
    if (!attemptId) throw new Error('unreachable');

    const answer = fakeCtx();
    await handleExamOption(
      answer.ctx,
      examBot,
      user(USER_A),
      { attemptId, questionIndex: 0, optionIndex: 0 },
      NOW,
    );

    const reread = fakeCtx();
    await handleExamQuestion(
      reread.ctx,
      examBot,
      user(USER_A),
      { attemptId, index: 0 },
      NOW,
    );
    expect(reread.buttonTexts[0]).toContain('✓ Три');
  });

  it('чужая попытка не отвечает — ATTEMPT_NOT_FOUND_MESSAGE, не содержимое', async () => {
    const examId = await publishedSingleChoiceExam();
    const start = fakeCtx();
    await handleExamStart(start.ctx, examBot, user(USER_A), examId, NOW);

    const attempts = await ctx.service.list({}, { ...user(USER_A) }, NOW);
    const attemptId = attempts[0]?.id;
    if (!attemptId) throw new Error('unreachable');

    const stranger = fakeCtx();
    await handleExamQuestion(
      stranger.ctx,
      examBot,
      user(USER_B),
      { attemptId, index: 0 },
      NOW,
    );
    expect(stranger.edits).toEqual(['Попытка не найдена. Обновите страницу.']);

    const strangerOption = fakeCtx();
    await handleExamOption(
      strangerOption.ctx,
      examBot,
      user(USER_B),
      { attemptId, questionIndex: 0, optionIndex: 0 },
      NOW,
    );
    expect(strangerOption.edits).toEqual(['Попытка не найдена. Обновите страницу.']);
  });

  it('«Сдать» переводит попытку в submitted — видно в следующем чтении', async () => {
    const examId = await publishedSingleChoiceExam();
    const start = fakeCtx();
    await handleExamStart(start.ctx, examBot, user(USER_A), examId, NOW);
    const attempts = await ctx.service.list({}, { ...user(USER_A) }, NOW);
    const attemptId = attempts[0]?.id;
    if (!attemptId) throw new Error('unreachable');

    const submit = fakeCtx();
    await handleExamSubmit(submit.ctx, examBot, user(USER_A), attemptId, NOW);
    expect(submit.edits).toEqual([
      'Работа отправлена. Учитель проверит и пришлёт результат.',
    ]);

    const after = await ctx.service.list({}, { ...user(USER_A) }, NOW);
    expect(after[0]?.status).toBe('submitted');
  });
});
