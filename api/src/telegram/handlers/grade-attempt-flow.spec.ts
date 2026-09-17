// Против настоящей Mongo (mongodb-memory-server, не мок — CLAUDE.md «Тесты»):
// проверка сданной работы в боте (ТЗ 4б.5, docs/PLAN.md §12) — учитель ставит
// итог кнопкой, пишет комментарий, оценка видна read-after-write в той же
// карточке (`GET /attempts/:id/review`) и в `/me/exams` ученика; ученику
// уходит ровно одно `exam_result` на изменение решения (правило
// ExamGradingsService.grade — didGradingChange). Владение: чужой/неизвестный
// attemptId — отказ без объяснения причин (SECURITY §3); /проверка — только
// штат (PersonalChats), тем же гейтом, что и остальные команды бота.
import { DateTime } from 'luxon';
import type { UserLean } from '../../users/users.service';
import { UsersService } from '../../users/users.service';
import { ChannelRecord } from '../../channels/channel.schema';
import { USER_A } from '../../exams/exam-attempts.test-support';
import { fakeExamBotPort } from '../exam-bot.port.test-support';
import { ExamBotPortRegistry } from '../exam-bot-port.registry';
import { buildPersonalChats } from '../test-support/build-personal-chats';
import {
  botUser,
  clearFlowTest,
  fakeFlowCtx,
  publishedFlowExam,
  setupFlowTest,
  type FlowTestContext,
} from './exam-attempt-flow.test-support';
import { buildGradeButtonId } from './grade-callback-id';
import {
  handleGradeCancel,
  handleGradeOutcome,
  handleGradeSkip,
  handleGradeView,
} from './grade-callback.handler';
import { GradeCommentHandler } from './grade-comment.handler';
import { GradeQueueHandler } from './grade-queue.handler';

const NOW = DateTime.utc(2026, 9, 17, 10, 0, 0);
const TEACHER_CHAT_ID = 222;
const UNKNOWN_ATTEMPT_ID = '000000000000000000000000';

describe('проверка сданной работы в боте (интеграция, Mongo)', () => {
  let flow: FlowTestContext;
  let usersService: UsersService;
  let gradeCommentHandler: GradeCommentHandler;
  let channelModel: import('mongoose').Model<ChannelRecord>;

  beforeAll(async () => {
    flow = await setupFlowTest();
    usersService = new UsersService(flow.ctx.userModel);
    gradeCommentHandler = new GradeCommentHandler(
      flow.botSessions,
      usersService,
      flow.registry,
    );
    channelModel = flow.ctx.memory.connection.model<ChannelRecord>(ChannelRecord.name);
  }, 60_000);

  afterAll(async () => {
    await flow.ctx.memory.stop();
  });

  afterEach(async () => {
    await clearFlowTest(flow);
    await channelModel.deleteMany({});
    flow.ctx.examNotifier.notifyAttemptSubmitted.mockClear();
    flow.ctx.examNotifier.notifyExamGraded.mockClear();
  });

  async function seedGrader(chatId: number): Promise<void> {
    await flow.ctx.userModel.create({
      name: 'Дима',
      telegramId: chatId,
      roles: ['teacher'],
    });
    await channelModel.create({
      type: 'telegram',
      title: 'x',
      config: '{}',
      target: String(chatId),
      active: true,
    });
  }

  /** Одна опубликованная форма (выбор + текст), попытка ученика начата,
   * отвечена и сдана — стартовая точка для всех сценариев проверки ниже. */
  async function submittedAttempt(): Promise<{
    attemptId: string;
    student: UserLean;
  }> {
    const { examId, itemIds } = await publishedFlowExam(
      flow.ctx,
      ['single', 'text'],
      NOW,
    );
    const student = botUser(USER_A);
    const attempt = await flow.examBot.startAttempt(examId, student, NOW);
    const optionId = attempt.blocks[0]?.questions[0]?.options[0]?.id;
    if (!optionId) throw new Error('вариант ответа не найден в снимке попытки');

    await flow.examBot.saveAnswer(
      attempt.id,
      student,
      { itemId: itemIds[0] as string, optionIds: [optionId] },
      NOW,
    );
    await flow.examBot.saveAnswer(
      attempt.id,
      student,
      { itemId: itemIds[1] as string, text: 'Плавно, с опорой на пятку' },
      NOW,
    );
    const submitted = await flow.examBot.submitAttempt(attempt.id, student, NOW);
    return { attemptId: submitted.id, student };
  }

  it('попытка сдана — карточка проверки готова (ответы, автопроверка варианта)', async () => {
    const { attemptId } = await submittedAttempt();

    const review = await flow.examBot.loadAttemptReview(attemptId);

    expect(review).not.toBeNull();
    expect(review?.status).toBe('submitted');
    expect(review?.blocks[0]?.questions[0]?.optionsCheck).toEqual({
      correctSelectedCount: 1,
      correctTotalCount: 1,
      incorrectSelectedCount: 0,
    });
    expect(review?.blocks[1]?.questions[0]?.answerText).toBe('Плавно, с опорой на пятку');
  });

  it('«Зачёт» → комментарий → read-after-write в review и в /me/exams, ученику одно exam_result', async () => {
    await seedGrader(TEACHER_CHAT_ID);
    const { attemptId, student } = await submittedAttempt();

    const outcomeCtx = fakeFlowCtx();
    await handleGradeOutcome(
      outcomeCtx.ctx,
      flow.examBot,
      flow.botSessions,
      TEACHER_CHAT_ID,
      buildGradeButtonId(attemptId, 'passed'),
      NOW,
    );
    expect(outcomeCtx.edits[0]).toContain('комментарий');
    expect(outcomeCtx.buttonTexts[0]).toEqual(['Без комментария', 'Отмена']);

    const session = await flow.botSessions.get(TEACHER_CHAT_ID, NOW);
    if (!session) throw new Error('ожидание комментария не найдено');
    const commentCtx = fakeFlowCtx({ text: 'Хорошо, подтяните дыхание' });
    await gradeCommentHandler.handle(commentCtx.ctx, TEACHER_CHAT_ID, session, NOW);
    expect(commentCtx.replies[0]).toContain('Зачёт');
    expect(commentCtx.replies[0]).toContain('поставлено');
    expect(await flow.botSessions.get(TEACHER_CHAT_ID, NOW)).toBeNull();

    // Read-after-write — та же карточка проверки, что редактировали кнопкой.
    const graded = await flow.examBot.loadAttemptReview(attemptId);
    expect(graded?.grading).toMatchObject({
      outcome: 'passed',
      comment: 'Хорошо, подтяните дыхание',
    });

    // Read-after-write — экран ученика (MyExamsService через тот же порт).
    const myExams = await flow.examBot.listMyExams(student, NOW);
    expect(myExams[0]?.lastAttempt).toMatchObject({
      id: attemptId,
      status: 'graded',
      outcome: 'passed',
    });

    expect(flow.ctx.examNotifier.notifyExamGraded).toHaveBeenCalledTimes(1);

    // Повтор с тем же итогом и комментарием — переписывает (не плодит вторую
    // оценку), но не шлёт второе уведомление (didGradingChange, слой 4.7).
    await handleGradeOutcome(
      fakeFlowCtx().ctx,
      flow.examBot,
      flow.botSessions,
      TEACHER_CHAT_ID,
      buildGradeButtonId(attemptId, 'passed'),
      NOW,
    );
    const sameSession = await flow.botSessions.get(TEACHER_CHAT_ID, NOW);
    if (!sameSession) throw new Error('ожидание комментария не найдено');
    await gradeCommentHandler.handle(
      fakeFlowCtx({ text: 'Хорошо, подтяните дыхание' }).ctx,
      TEACHER_CHAT_ID,
      sameSession,
      NOW,
    );
    expect(flow.ctx.examNotifier.notifyExamGraded).toHaveBeenCalledTimes(1);

    // Другой итог, без комментария («Без комментария») — переписывает и
    // шлёт уведомление снова (решение реально изменилось).
    await handleGradeOutcome(
      fakeFlowCtx().ctx,
      flow.examBot,
      flow.botSessions,
      TEACHER_CHAT_ID,
      buildGradeButtonId(attemptId, 'failed'),
      NOW,
    );
    await handleGradeSkip(
      fakeFlowCtx().ctx,
      flow.examBot,
      flow.botSessions,
      usersService,
      TEACHER_CHAT_ID,
      attemptId,
      NOW,
    );
    const regraded = await flow.examBot.loadAttemptReview(attemptId);
    expect(regraded?.grading?.outcome).toBe('failed');
    // «Без комментария» шлёт пустую строку, не `undefined` (grade-callback.
    // handler.ts): иначе ExamGradingsService.grade() (`$set` без `$unset`)
    // оставил бы прежний комментарий от предыдущей оценки.
    expect(regraded?.grading?.comment).toBeFalsy();
    expect(flow.ctx.examNotifier.notifyExamGraded).toHaveBeenCalledTimes(2);
  });

  it('комментарий не текстом — просит прислать текст, ожидание остаётся', async () => {
    await seedGrader(TEACHER_CHAT_ID);
    const { attemptId } = await submittedAttempt();
    await handleGradeOutcome(
      fakeFlowCtx().ctx,
      flow.examBot,
      flow.botSessions,
      TEACHER_CHAT_ID,
      buildGradeButtonId(attemptId, 'passed'),
      NOW,
    );
    const session = await flow.botSessions.get(TEACHER_CHAT_ID, NOW);
    if (!session) throw new Error('ожидание комментария не найдено');

    const notTextCtx = fakeFlowCtx(); // текст по умолчанию — пустая строка
    await gradeCommentHandler.handle(notTextCtx.ctx, TEACHER_CHAT_ID, session, NOW);

    expect(notTextCtx.replies).toEqual([
      'Ждём комментарий текстом — пришлите его обычным сообщением, ' +
        'или нажмите «Без комментария» под предыдущим сообщением.',
    ]);
    expect(await flow.botSessions.get(TEACHER_CHAT_ID, NOW)).not.toBeNull();
  });

  it('сессия без attemptId/outcome (защита в глубину) — тихо игнорируется', async () => {
    const brokenSession = { kind: 'gradeComment' as const };
    const brokenCtx = fakeFlowCtx({ text: 'Комментарий' });

    await expect(
      gradeCommentHandler.handle(brokenCtx.ctx, TEACHER_CHAT_ID, brokenSession, NOW),
    ).resolves.toBeUndefined();

    expect(brokenCtx.replies).toEqual([]);
  });

  it('комментарий видеосообщением, а не текстом — просит текст, не роняет ветку', async () => {
    await seedGrader(TEACHER_CHAT_ID);
    const { attemptId } = await submittedAttempt();
    await handleGradeOutcome(
      fakeFlowCtx().ctx,
      flow.examBot,
      flow.botSessions,
      TEACHER_CHAT_ID,
      buildGradeButtonId(attemptId, 'passed'),
      NOW,
    );
    const session = await flow.botSessions.get(TEACHER_CHAT_ID, NOW);
    if (!session) throw new Error('ожидание комментария не найдено');

    const videoCtx = fakeFlowCtx({ video: true });
    await gradeCommentHandler.handle(videoCtx.ctx, TEACHER_CHAT_ID, session, NOW);

    expect(videoCtx.replies).toEqual([
      'Ждём комментарий текстом — пришлите его обычным сообщением, ' +
        'или нажмите «Без комментария» под предыдущим сообщением.',
    ]);
    expect(await flow.botSessions.get(TEACHER_CHAT_ID, NOW)).not.toBeNull();
  });

  it('комментарий от неизвестного chatId (защита в глубину) — тихо игнорируется', async () => {
    await seedGrader(TEACHER_CHAT_ID);
    const { attemptId } = await submittedAttempt();
    await handleGradeOutcome(
      fakeFlowCtx().ctx,
      flow.examBot,
      flow.botSessions,
      TEACHER_CHAT_ID,
      buildGradeButtonId(attemptId, 'passed'),
      NOW,
    );
    const session = await flow.botSessions.get(TEACHER_CHAT_ID, NOW);
    if (!session) throw new Error('ожидание комментария не найдено');
    const unknownChatCtx = fakeFlowCtx({ text: 'Комментарий' });

    await expect(
      gradeCommentHandler.handle(unknownChatCtx.ctx, 999999, session, NOW),
    ).resolves.toBeUndefined();

    expect(unknownChatCtx.replies).toEqual([]);
  });

  it('упавший хендлер комментария — фраза в чат, ожидание не закрывается', async () => {
    await seedGrader(TEACHER_CHAT_ID);
    const { attemptId } = await submittedAttempt();
    await handleGradeOutcome(
      fakeFlowCtx().ctx,
      flow.examBot,
      flow.botSessions,
      TEACHER_CHAT_ID,
      buildGradeButtonId(attemptId, 'passed'),
      NOW,
    );
    const session = await flow.botSessions.get(TEACHER_CHAT_ID, NOW);
    if (!session) throw new Error('ожидание комментария не найдено');

    const brokenUsersService = {
      findByTelegramId: () => Promise.reject(new Error('mongo упал')),
    } as unknown as UsersService;
    const brokenHandler = new GradeCommentHandler(
      flow.botSessions,
      brokenUsersService,
      flow.registry,
    );
    const failCtx = fakeFlowCtx({ text: 'Хорошо' });

    await expect(
      brokenHandler.handle(failCtx.ctx, TEACHER_CHAT_ID, session, NOW),
    ).resolves.toBeUndefined();

    expect(failCtx.replies).toEqual(['Что-то пошло не так. Попробуйте ещё раз.']);
    expect(await flow.botSessions.get(TEACHER_CHAT_ID, NOW)).not.toBeNull();
  });

  it('«Отмена» гасит ожидание комментария, оценка не сохраняется', async () => {
    await seedGrader(TEACHER_CHAT_ID);
    const { attemptId } = await submittedAttempt();

    await handleGradeOutcome(
      fakeFlowCtx().ctx,
      flow.examBot,
      flow.botSessions,
      TEACHER_CHAT_ID,
      buildGradeButtonId(attemptId, 'needs_work'),
      NOW,
    );
    const cancelCtx = fakeFlowCtx();
    await handleGradeCancel(cancelCtx.ctx, flow.botSessions, TEACHER_CHAT_ID, attemptId);

    expect(cancelCtx.edits[0]).toContain('Отменено');
    expect(await flow.botSessions.get(TEACHER_CHAT_ID, NOW)).toBeNull();
    expect((await flow.examBot.loadAttemptReview(attemptId))?.grading).toBeUndefined();
    expect(flow.ctx.examNotifier.notifyExamGraded).not.toHaveBeenCalled();
  });

  it('неизвестный attemptId — отказ без объяснения причин, ожидание не заводится', async () => {
    await seedGrader(TEACHER_CHAT_ID);

    const outcomeCtx = fakeFlowCtx();
    await handleGradeOutcome(
      outcomeCtx.ctx,
      flow.examBot,
      flow.botSessions,
      TEACHER_CHAT_ID,
      buildGradeButtonId(UNKNOWN_ATTEMPT_ID, 'passed'),
      NOW,
    );

    expect(outcomeCtx.edits[0]).toContain('не найдена');
    expect(await flow.botSessions.get(TEACHER_CHAT_ID, NOW)).toBeNull();
    expect(await flow.examBot.loadAttemptReview(UNKNOWN_ATTEMPT_ID)).toBeNull();
    expect(
      await flow.examBot.gradeAttempt(
        UNKNOWN_ATTEMPT_ID,
        'g1',
        { outcome: 'passed' },
        NOW,
      ),
    ).toBeNull();
  });

  it('битый id кнопки итога (защита в глубину) — тихо игнорируется', async () => {
    await seedGrader(TEACHER_CHAT_ID);

    const outcomeCtx = fakeFlowCtx();
    await expect(
      handleGradeOutcome(
        outcomeCtx.ctx,
        flow.examBot,
        flow.botSessions,
        TEACHER_CHAT_ID,
        'не-attemptId:passed',
        NOW,
      ),
    ).resolves.toBeUndefined();

    expect(outcomeCtx.edits).toEqual([]);
    expect(await flow.botSessions.get(TEACHER_CHAT_ID, NOW)).toBeNull();
  });

  it('«Без комментария» от chatId без пользователя (защита в глубину) — тихо игнорируется', async () => {
    await seedGrader(TEACHER_CHAT_ID);
    const { attemptId } = await submittedAttempt();
    await handleGradeOutcome(
      fakeFlowCtx().ctx,
      flow.examBot,
      flow.botSessions,
      TEACHER_CHAT_ID,
      buildGradeButtonId(attemptId, 'passed'),
      NOW,
    );
    const brokenUsersService = {
      findByTelegramId: () => Promise.resolve(null),
    } as unknown as UsersService;
    const skipCtx = fakeFlowCtx();

    await expect(
      handleGradeSkip(
        skipCtx.ctx,
        flow.examBot,
        flow.botSessions,
        brokenUsersService,
        TEACHER_CHAT_ID,
        attemptId,
        NOW,
      ),
    ).resolves.toBeUndefined();

    expect(skipCtx.edits).toEqual([]);
    expect((await flow.examBot.loadAttemptReview(attemptId))?.grading).toBeUndefined();
  });

  it('«Без комментария» без активного ожидания — фраза «истекло», не бросает', async () => {
    await seedGrader(TEACHER_CHAT_ID);
    const { attemptId } = await submittedAttempt();

    const skipCtx = fakeFlowCtx();
    await handleGradeSkip(
      skipCtx.ctx,
      flow.examBot,
      flow.botSessions,
      usersService,
      TEACHER_CHAT_ID,
      attemptId,
      NOW,
    );

    expect(skipCtx.edits[0]).toContain('истекло');
    expect((await flow.examBot.loadAttemptReview(attemptId))?.grading).toBeUndefined();
  });

  it('карточка из списка /проверка (gradeq) — та же, что уходит в уведомлении', async () => {
    await seedGrader(TEACHER_CHAT_ID);
    const { attemptId } = await submittedAttempt();

    const viewCtx = fakeFlowCtx();
    await handleGradeView(viewCtx.ctx, flow.examBot, attemptId, undefined);

    expect(viewCtx.replies[0]).toContain('ждёт вашей проверки');
    expect(viewCtx.buttonTexts[0]).toEqual(['Зачёт', 'Доработать', 'Незачёт']);
  });

  it('карточка из /проверка на неизвестный attemptId — отказ без объяснения причин', async () => {
    const viewCtx = fakeFlowCtx();
    await handleGradeView(viewCtx.ctx, flow.examBot, UNKNOWN_ATTEMPT_ID, undefined);

    expect(viewCtx.replies).toEqual(['Работа не найдена — возможно, её уже удалили.']);
  });

  it('/проверка — список сданного штату, тихо не-штату', async () => {
    await seedGrader(TEACHER_CHAT_ID);
    await submittedAttempt();
    const personalChats = buildPersonalChats(
      flow.ctx.memory.connection,
      usersService,
      channelModel,
    );
    const queueHandler = new GradeQueueHandler(
      personalChats,
      usersService,
      flow.registry,
    );

    const teacherCtx = fakeFlowCtx();
    Object.assign(teacherCtx.ctx, { chat: { id: TEACHER_CHAT_ID, type: 'private' } });
    await queueHandler.handle(teacherCtx.ctx, NOW);
    // Имя ученика — из UserRecord (exam-attempts.test-support не создаёт его
    // сам: USER_A — просто userId, имя приходит из посева ниже через
    // examAttemptsService.list в самом examBot).
    expect(teacherCtx.replies[0]).toContain('ждёт проверки');

    await flow.ctx.userModel.create({ name: 'Ученик', telegramId: 333, roles: [] });
    const studentCtx = fakeFlowCtx();
    Object.assign(studentCtx.ctx, { chat: { id: 333, type: 'private' } });
    await queueHandler.handle(studentCtx.ctx, NOW);
    expect(studentCtx.replies).toEqual([]);
  });

  it('/проверка — сбой сервиса не бросает, штат не получает ответ (защита в глубину)', async () => {
    await seedGrader(TEACHER_CHAT_ID);
    const personalChats = buildPersonalChats(
      flow.ctx.memory.connection,
      usersService,
      channelModel,
    );
    const brokenRegistry = new ExamBotPortRegistry();
    brokenRegistry.set(
      fakeExamBotPort({
        listSubmittedAttempts: jest.fn().mockRejectedValue(new Error('mongo упал')),
      }),
    );
    const queueHandler = new GradeQueueHandler(
      personalChats,
      usersService,
      brokenRegistry,
    );

    const teacherCtx = fakeFlowCtx();
    Object.assign(teacherCtx.ctx, { chat: { id: TEACHER_CHAT_ID, type: 'private' } });

    await expect(queueHandler.handle(teacherCtx.ctx, NOW)).resolves.toBeUndefined();
    expect(teacherCtx.replies).toEqual([]);
  });

  it('/проверка — чат распознан, но пользователь пропал (защита в глубину) — молчит', async () => {
    await seedGrader(TEACHER_CHAT_ID);
    const personalChats = buildPersonalChats(
      flow.ctx.memory.connection,
      usersService,
      channelModel,
    );
    const brokenUsersService = {
      findByTelegramId: () => Promise.resolve(null),
    } as unknown as UsersService;
    const queueHandler = new GradeQueueHandler(
      personalChats,
      brokenUsersService,
      flow.registry,
    );

    const teacherCtx = fakeFlowCtx();
    Object.assign(teacherCtx.ctx, { chat: { id: TEACHER_CHAT_ID, type: 'private' } });

    await expect(queueHandler.handle(teacherCtx.ctx, NOW)).resolves.toBeUndefined();
    expect(teacherCtx.replies).toEqual([]);
  });

  it('телеграм не принял ответ (сеть моргнула) — не бросает ни в одном из хендлеров', async () => {
    await seedGrader(TEACHER_CHAT_ID);
    const { attemptId } = await submittedAttempt();
    const failingSend = () => Promise.reject(new Error('telegram упал'));

    const outcomeCtx = fakeFlowCtx();
    Object.assign(outcomeCtx.ctx, { editMessageText: failingSend });
    await expect(
      handleGradeOutcome(
        outcomeCtx.ctx,
        flow.examBot,
        flow.botSessions,
        TEACHER_CHAT_ID,
        buildGradeButtonId(attemptId, 'passed'),
        NOW,
      ),
    ).resolves.toBeUndefined();

    const viewCtx = fakeFlowCtx();
    Object.assign(viewCtx.ctx, { reply: failingSend });
    await expect(
      handleGradeView(viewCtx.ctx, flow.examBot, attemptId, undefined),
    ).resolves.toBeUndefined();

    const personalChats = buildPersonalChats(
      flow.ctx.memory.connection,
      usersService,
      channelModel,
    );
    const queueHandler = new GradeQueueHandler(
      personalChats,
      usersService,
      flow.registry,
    );
    const queueCtx = fakeFlowCtx();
    Object.assign(queueCtx.ctx, {
      chat: { id: TEACHER_CHAT_ID, type: 'private' },
      reply: failingSend,
    });
    await expect(queueHandler.handle(queueCtx.ctx, NOW)).resolves.toBeUndefined();
  });
});
