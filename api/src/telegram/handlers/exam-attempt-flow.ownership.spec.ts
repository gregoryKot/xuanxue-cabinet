// PLAN.md §12 «Тесты, без которых этап не закрыт», п. 3, и §11 — «видео из
// бота привязывается к попытке того, кто его прислал; чужой attemptId в
// deep link не привязывает ничего». Личность здесь — настоящая цепочка
// telegramId → users → userId (BotUserAccessService поверх UsersService на
// той же Mongo), не подставленный UserLean: кнопку с чужим attemptId может
// подделать кто угодно, и владение обязано решаться по отправителю, а не
// по параметру callback data (SECURITY §3/§4). Обвязка —
// exam-attempt-flow.test-support.ts.
import { DateTime } from 'luxon';
import { ATTEMPT_NOT_FOUND_MESSAGE } from '@xuanxue/shared';
import { UsersService } from '../../users/users.service';
import { BotUserAccessService } from '../bot-user-access.service';
import { handleExamMediaDeepLink } from './exam-media-deep-link';
import { ExamMediaMessageHandler } from './exam-media-message.handler';
import { routeExamCallback } from './exam-callback-router';
import {
  botUser,
  clearFlowTest,
  fakeFlowCtx,
  NO_TEACHER_CHATS,
  publishedFlowExam,
  setupFlowTest,
  type FlowFakeCtx,
  type FlowTestContext,
} from './exam-attempt-flow.test-support';
import { buildOptionId } from './exam-callback-ids';

const NOW = DateTime.utc(2026, 9, 12, 10, 0, 0);
const CHAT_A = 111;
const CHAT_B = 222;
const CHAT_STRANGER = 333;
const ATTEMPT_NOT_YOURS_FRAGMENT = 'Не нашли эту попытку среди ваших';

describe('владение попыткой в боте — по telegramId отправителя, не по параметру', () => {
  let flow: FlowTestContext;
  let botAccess: BotUserAccessService;
  let userIdA: string;
  let userIdB: string;

  beforeAll(async () => {
    flow = await setupFlowTest();
    botAccess = new BotUserAccessService(new UsersService(flow.ctx.userModel));
  }, 60_000);

  afterAll(async () => {
    await flow.ctx.memory.stop();
  });

  beforeEach(async () => {
    const [a, b] = await flow.ctx.userModel.create([
      { name: 'Ученик А', telegramId: CHAT_A, roles: [] },
      { name: 'Ученик Б', telegramId: CHAT_B, roles: [] },
    ]);
    userIdA = a?._id.toString() ?? '';
    userIdB = b?._id.toString() ?? '';
  });

  afterEach(async () => {
    await clearFlowTest(flow);
  });

  /** Кнопка бота из чата `chatId` — через тот же диспетчер, что и
   * CallbackQueryHandler (exam-callback-router.ts), с настоящим resolve(). */
  async function press(
    chatId: number,
    action: 'exam' | 'eq' | 'eo' | 'es',
    id: string,
  ): Promise<FlowFakeCtx> {
    const fake = fakeFlowCtx();
    await routeExamCallback(
      fake.ctx,
      action,
      id,
      chatId,
      botAccess,
      flow.examBot,
      flow.botSessions,
      NOW,
    );
    return fake;
  }

  it('чужой attemptId в callback — «попытка не найдена», попытка владельца не тронута', async () => {
    const { examId } = await publishedFlowExam(flow.ctx, ['single'], NOW);
    const startedByA = await press(CHAT_A, 'exam', examId);
    expect(startedByA.edits[0]).toContain('Вопрос 1 из 1');
    const attempt = await flow.ctx.service.start(examId, userIdA, NOW);

    // Б подделал кнопку с attemptId ученика А: ответ, переход, «Сдать».
    const optionId = buildOptionId(attempt.id, 0, 0);
    expect((await press(CHAT_B, 'eo', optionId)).edits).toEqual([
      ATTEMPT_NOT_FOUND_MESSAGE,
    ]);
    expect((await press(CHAT_B, 'es', attempt.id)).edits).toEqual([
      ATTEMPT_NOT_FOUND_MESSAGE,
    ]);

    // Незнакомый Telegram (нет записи в users) — молчание, как для любой чужой кнопки.
    expect((await press(CHAT_STRANGER, 'eo', optionId)).edits).toEqual([]);

    const [own] = await flow.ctx.service.list({}, botUser(userIdA), NOW);
    expect(own).toMatchObject({ status: 'in_progress', answers: [] });
    // У Б своих попыток по этой форме не появилось — чужая кнопка не заводит его попытку.
    await expect(flow.ctx.attemptModel.countDocuments({ userId: userIdB })).resolves.toBe(
      0,
    );

    // Тот же callback из чата владельца — работает: личность взята из telegramId.
    expect((await press(CHAT_A, 'eo', optionId)).buttonTexts[0]).toContain('✓ Три');
    const [answered] = await flow.ctx.service.list({}, botUser(userIdA), NOW);
    expect(answered?.answers).toHaveLength(1);
  });

  it('видео по deep link с чужим attemptId не привязывается; со своим — привязывается к попытке отправителя', async () => {
    const { examId, itemIds } = await publishedFlowExam(flow.ctx, ['video'], NOW);
    const attemptA = await flow.ctx.service.start(examId, userIdA, NOW);
    const mediaHandler = new ExamMediaMessageHandler(
      flow.botSessions,
      flow.ctx.mediaAssetsService,
      botAccess,
      NO_TEACHER_CHATS,
      flow.registry,
    );
    const deps = { botSessions: flow.botSessions, botAccess };

    // Б открыл ссылку «Отправить видео» с attemptId ученика А и прислал видео.
    await handleExamMediaDeepLink(
      fakeFlowCtx().ctx,
      CHAT_B,
      attemptA.id,
      NOW,
      deps,
      itemIds[0],
    );
    const sessionB = await flow.botSessions.get(CHAT_B, NOW);
    expect(sessionB?.kind).toBe('examMedia');
    if (!sessionB) throw new Error('unreachable');
    const videoFromB = fakeFlowCtx({ video: true });
    await mediaHandler.handle(videoFromB.ctx, CHAT_B, sessionB, NOW);

    expect(videoFromB.replies[0]).toContain(ATTEMPT_NOT_YOURS_FRAGMENT);
    await expect(
      flow.ctx.mediaAssetsService.listForAttempt(attemptA.id),
    ).resolves.toEqual([]);
    await expect(flow.botSessions.get(CHAT_B, NOW)).resolves.toBeNull();

    // А по той же ссылке — видео у попытки А, у нужного вопроса.
    await handleExamMediaDeepLink(
      fakeFlowCtx().ctx,
      CHAT_A,
      attemptA.id,
      NOW,
      deps,
      itemIds[0],
    );
    const sessionA = await flow.botSessions.get(CHAT_A, NOW);
    if (!sessionA) throw new Error('unreachable');
    const videoFromA = fakeFlowCtx({ video: true });
    await mediaHandler.handle(videoFromA.ctx, CHAT_A, sessionA, NOW);

    expect(videoFromA.replies[0]).toContain('Видео получено');
    const media = await flow.ctx.mediaAssetsService.listForAttempt(attemptA.id);
    expect(media).toHaveLength(1);
    expect(media[0]).toMatchObject({ kind: 'telegram', itemId: itemIds[0] });
    await expect(flow.ctx.mediaModel.countDocuments({ userId: userIdB })).resolves.toBe(
      0,
    );
  });
});
