// Против настоящей Mongo (CLAUDE.md «Тесты»): маршрутизация кнопок проверки
// (grade/gradesk/gradecl/gradeq, ТЗ 4б.5) внутри CallbackQueryHandler.handle() —
// сама механика (карточка, сохранение оценки, идемпотентность) проверена
// интеграционным grade-attempt-flow.spec.ts прямыми вызовами
// handleGradeOutcome/Skip/Cancel/View; здесь — что диспетчер зовёт именно их
// по действию из callback_data, тем же приёмом, что и остальные кнопки
// (callback-query.handler.menu.spec.ts).
import type { AttemptReviewDto } from '@xuanxue/shared';
import { BotSessionService } from '../bot-session.service';
import { ExamBotPortRegistry } from '../exam-bot-port.registry';
import { fakeExamBotPort } from '../exam-bot.port.test-support';
import {
  buildHandler,
  clearCallbackHandlerTest,
  NOW,
  seedTeacher,
  setupCallbackHandlerTest,
  type CallbackHandlerTestContext,
} from './callback-query.handler.test-support';
import { fakeCtx } from './callback-query.handler.fake-ctx';

const ATTEMPT_ID = '507f1f77bcf86cd799439011';
const CHAT_ID = 111;

function fakeReview(): AttemptReviewDto {
  return {
    attemptId: ATTEMPT_ID,
    examId: '507f1f77bcf86cd799439012',
    examTitle: 'Экзамен по третьей форме',
    userId: '507f1f77bcf86cd799439013',
    userName: 'Ольга',
    status: 'submitted',
    blocks: [],
    notifiesUserInTelegram: true,
  };
}

function registryWith(
  overrides: Parameters<typeof fakeExamBotPort>[0],
): ExamBotPortRegistry {
  const registry = new ExamBotPortRegistry();
  registry.set(fakeExamBotPort(overrides));
  return registry;
}

describe('CallbackQueryHandler — проверка сданной работы (grade/gradesk/gradecl/gradeq)', () => {
  let ctx: CallbackHandlerTestContext;

  beforeAll(async () => {
    ctx = await setupCallbackHandlerTest();
  }, 60_000);

  afterAll(async () => {
    await ctx.memory.stop();
  });

  afterEach(async () => {
    await clearCallbackHandlerTest(ctx);
  });

  it('grade:<attemptId>:passed — ставит ожидание комментария, правит сообщение', async () => {
    await seedTeacher(ctx.userModel, ctx.channelModel, CHAT_ID);
    const handler = buildHandler(ctx, {
      examBotPorts: registryWith({
        loadAttemptReview: jest.fn().mockResolvedValue(fakeReview()),
      }),
    });
    const { ctx: cbCtx, editCalls } = fakeCtx({
      chatId: CHAT_ID,
      data: `grade:${ATTEMPT_ID}:passed`,
    });

    await handler.handle(cbCtx, NOW);

    expect(editCalls[0]).toContain('комментарий');
    const session = await new BotSessionService(ctx.botSessionModel).get(CHAT_ID, NOW);
    expect(session).toMatchObject({ kind: 'gradeComment', outcome: 'passed' });
  });

  it('gradesk:<attemptId> — сохраняет без комментария, снимает ожидание', async () => {
    await seedTeacher(ctx.userModel, ctx.channelModel, CHAT_ID);
    const botSessions = new BotSessionService(ctx.botSessionModel);
    await botSessions.startGradeCommentWait(CHAT_ID, ATTEMPT_ID, 'passed', NOW);
    const handler = buildHandler(ctx, {
      botSessions,
      examBotPorts: registryWith({
        gradeAttempt: jest.fn().mockResolvedValue({
          id: 'g1',
          attemptId: ATTEMPT_ID,
          examId: 'e1',
          userId: 'u1',
          graderId: 'g',
          outcome: 'passed',
          gradedAt: NOW.toISO(),
        }),
      }),
    });
    const { ctx: cbCtx, editCalls } = fakeCtx({
      chatId: CHAT_ID,
      data: `gradesk:${ATTEMPT_ID}`,
    });

    await handler.handle(cbCtx, NOW);

    expect(editCalls[0]).toContain('Зачёт');
    expect(await botSessions.get(CHAT_ID, NOW)).toBeNull();
  });

  it('gradecl:<attemptId> — гасит ожидание, не сохраняя оценку', async () => {
    await seedTeacher(ctx.userModel, ctx.channelModel, CHAT_ID);
    const botSessions = new BotSessionService(ctx.botSessionModel);
    await botSessions.startGradeCommentWait(CHAT_ID, ATTEMPT_ID, 'needs_work', NOW);
    const handler = buildHandler(ctx, { botSessions });
    const { ctx: cbCtx, editCalls } = fakeCtx({
      chatId: CHAT_ID,
      data: `gradecl:${ATTEMPT_ID}`,
    });

    await handler.handle(cbCtx, NOW);

    expect(editCalls).toEqual(['Отменено. Оценка не сохранена.']);
    expect(await botSessions.get(CHAT_ID, NOW)).toBeNull();
  });

  it('gradeq:<attemptId> — открывает карточку проверки новым сообщением', async () => {
    await seedTeacher(ctx.userModel, ctx.channelModel, CHAT_ID);
    const handler = buildHandler(ctx, {
      examBotPorts: registryWith({
        loadAttemptReview: jest.fn().mockResolvedValue(fakeReview()),
      }),
    });
    const { ctx: cbCtx, editCalls } = fakeCtx({
      chatId: CHAT_ID,
      data: `gradeq:${ATTEMPT_ID}`,
    });

    await handler.handle(cbCtx, NOW);

    expect(editCalls[0]).toContain('ждёт вашей проверки');
  });
});
