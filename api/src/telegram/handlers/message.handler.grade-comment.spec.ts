// Против настоящей Mongo (mongodb-memory-server — CLAUDE.md «Тесты»):
// диспетчер MessageHandler для сессии kind 'gradeComment' (ТЗ 4б.5, PLAN §12)
// — сама механика сохранения комментария и итога — дело
// grade-attempt-flow.spec.ts/grade-comment-save.spec.ts, здесь только то, что
// MessageHandler зовёт нужный хендлер и честно говорит об истёкшем ожидании
// (PR #175 — тот же разрыв для examText/examMedia чинили раньше).
import { DateTime } from 'luxon';
import { BotSessionService } from '../bot-session.service';
import { fakeCtx } from './message.handler.fake-ctx';
import { seedTeacher } from '../test-support/seed-teacher';
import {
  clearMessageHandlerTest,
  setupMessageHandlerTest,
  type MessageHandlerTestContext,
} from './message.handler.test-support';

const NOW = DateTime.fromISO('2026-09-17T09:00:00Z', { zone: 'utc' });
const CHAT_ID = 111;
const ATTEMPT_ID = '507f1f77bcf86cd799439011';

describe('MessageHandler — комментарий проверки (kind: gradeComment)', () => {
  let ctx: MessageHandlerTestContext;
  let botSessions: BotSessionService;

  beforeAll(async () => {
    ctx = await setupMessageHandlerTest();
    botSessions = new BotSessionService(ctx.botSessionModel);
  }, 60_000);

  afterAll(async () => {
    await ctx.memory.stop();
  });

  afterEach(async () => {
    await clearMessageHandlerTest(ctx);
    ctx.gradeCommentHandler.handle.mockClear();
  });

  it('активное ожидание комментария — зовёт GradeCommentHandler с этой сессией', async () => {
    await seedTeacher(ctx.userModel, ctx.channelModel, CHAT_ID);
    await botSessions.startGradeCommentWait(CHAT_ID, ATTEMPT_ID, 'passed', NOW);
    const { ctx: msgCtx } = fakeCtx({
      chatId: CHAT_ID,
      text: 'Хорошо, но подтянуть стойку',
    });

    await ctx.handler.handle(msgCtx, NOW);

    expect(ctx.gradeCommentHandler.handle).toHaveBeenCalledTimes(1);
    const [, chatId, session] = ctx.gradeCommentHandler.handle.mock.calls[0] as [
      unknown,
      number,
      { kind: string; outcome: string },
    ];
    expect(chatId).toBe(CHAT_ID);
    expect(session).toMatchObject({ kind: 'gradeComment', outcome: 'passed' });
  });

  it('ожидание истекло — фраза с действием, не тишина', async () => {
    await seedTeacher(ctx.userModel, ctx.channelModel, CHAT_ID);
    await botSessions.startGradeCommentWait(CHAT_ID, ATTEMPT_ID, 'passed', NOW);
    // Ожидание комментария — 10 минут (bot-session.service.ts,
    // GRADE_COMMENT_WAIT_MINUTES); 11 минут спустя оно точно истекло.
    const later = NOW.plus({ minutes: 11 });
    const { ctx: msgCtx, replies } = fakeCtx({
      chatId: CHAT_ID,
      text: 'Опоздал с ответом',
    });

    await ctx.handler.handle(msgCtx, later);

    expect(replies).toEqual([
      'Ожидание комментария истекло. Откройте работу заново: команда /проверка в боте.',
    ]);
    expect(ctx.gradeCommentHandler.handle).not.toHaveBeenCalled();
  });
});
