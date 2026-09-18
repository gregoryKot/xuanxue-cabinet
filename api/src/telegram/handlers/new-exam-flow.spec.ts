// Против настоящей Mongo (mongodb-memory-server, не мок — CLAUDE.md «Тесты»):
// учитель собирает экзамен в боте (ТЗ 4б.4, docs/PLAN.md §12) — отметка →
// название → лимит времени → число попыток → подтверждение → публикация,
// через тот же ExamsService.createAndPublishExam, что и кабинет (ADR-0024).
// Read-after-write — ExamsService.getById() и список ученика через
// ExamBotPort.listMyExams (MyExamsService, тот же путь, что у /me/exams);
// идемпотентность — повторный клик «Опубликовать» не плодит вторую форму;
// доступ — только штат; пустой набор — отказ сервиса, не хендлера; сбой
// посреди диалога не закрывает черновик раньше TTL.
import { DateTime } from 'luxon';
import type { BotSessionLean } from '../bot-session.lean';
import type { BotSessionService } from '../bot-session.service';
import { GENERIC_ERROR } from './callback-actions';
import { botUser, fakeFlowCtx } from './exam-attempt-flow.test-support';
import {
  handleNewExamAssemble,
  handleNewExamAttempts,
  handleNewExamCancel,
  handleNewExamTimeLimit,
  handleNewExamToggleItem,
} from './new-exam-callback';
import {
  CHAT_ID,
  clearNewExamFlowTest,
  publishedFlowItem,
  seedNewExamTeacher,
  setupNewExamFlowTest,
  textMessage,
  type NewExamFlowContext,
} from './new-exam-flow.test-support';
import { NewExamMessageHandler } from './new-exam-message.handler';
import { handleNewExamPublish } from './new-exam-save-callback';

const NOW = DateTime.utc(2026, 9, 17, 10, 0, 0);

/** Активная сессия сборки — между шагами диалога она всегда есть, `null`
 * означал бы поломку теста (сессия истекла или не заведена), не сценарий,
 * который стоит проверять здесь `?.` (тот же приём, что activeSession в
 * new-exam-item-flow.spec.ts). */
async function activeSession(botSessions: BotSessionService): Promise<BotSessionLean> {
  const session = await botSessions.get(CHAT_ID, NOW);
  if (!session) throw new Error('ожидание сборки не найдено — сессия истекла?');
  return session;
}

describe('учитель собирает экзамен в боте (интеграция, Mongo)', () => {
  let flowCtx: NewExamFlowContext;

  beforeAll(async () => {
    flowCtx = await setupNewExamFlowTest();
  }, 60_000);

  afterAll(async () => {
    await flowCtx.flow.ctx.memory.stop();
  });

  afterEach(async () => {
    await clearNewExamFlowTest(flowCtx);
  });

  function publish() {
    const { botSessions, examBot } = flowCtx.flow;
    const publishCtx = fakeFlowCtx();
    return handleNewExamPublish(
      publishCtx.ctx,
      botSessions,
      examBot,
      flowCtx.usersService,
      undefined,
      CHAT_ID,
      NOW,
    ).then(() => publishCtx);
  }

  it('/экзамен — незнакомцу и не-штату молчит', async () => {
    const { ctx, replies } = fakeFlowCtx();
    await flowCtx.commandHandler.handle(ctx, NOW);
    expect(replies).toEqual([]);
  });

  it('полный диалог до опубликованной формы — read-after-write через ExamsService и список ученика', async () => {
    await seedNewExamTeacher(flowCtx);
    const itemAId = await publishedFlowItem(flowCtx, 'Сколько форм в третьем уровне?');
    const itemBId = await publishedFlowItem(flowCtx, 'Опишите форму словами');
    const { botSessions, examBot } = flowCtx.flow;

    // Шаг 'pick' — команда показывает оба вопроса.
    const commandCtx = fakeFlowCtx();
    await flowCtx.commandHandler.handle(commandCtx.ctx, NOW);
    expect(commandCtx.replies[0]).toContain('Отметьте вопросы');
    expect(commandCtx.replies[0]).not.toContain('Страница');

    // Отмечаем оба вопроса.
    const toggleA = fakeFlowCtx();
    await handleNewExamToggleItem(
      toggleA.ctx,
      botSessions,
      examBot,
      CHAT_ID,
      itemAId,
      NOW,
    );
    const toggleB = fakeFlowCtx();
    await handleNewExamToggleItem(
      toggleB.ctx,
      botSessions,
      examBot,
      CHAT_ID,
      itemBId,
      NOW,
    );
    expect(toggleB.buttonTexts.flat()).toContain('Собрать (2)');

    // «Собрать (2)» → шаг 'title'.
    const assembleCtx = fakeFlowCtx();
    await handleNewExamAssemble(assembleCtx.ctx, botSessions, CHAT_ID, NOW);
    expect(assembleCtx.edits[0]).toContain('название');

    // Название — текстом.
    const titleMsg = textMessage('Экзамен по третьему уровню');
    await flowCtx.messageHandler.handle(
      titleMsg.ctx,
      CHAT_ID,
      await activeSession(botSessions),
      NOW,
    );
    expect(titleMsg.replies[0]).toContain('число минут');

    // Лимит времени — кнопка «Без лимита».
    const timeLimitCtx = fakeFlowCtx();
    await handleNewExamTimeLimit(timeLimitCtx.ctx, botSessions, CHAT_ID, 'none', NOW);
    expect(timeLimitCtx.edits[0]).toContain('попыток');

    // Число попыток — кнопка «2».
    const attemptsCtx = fakeFlowCtx();
    await handleNewExamAttempts(attemptsCtx.ctx, botSessions, CHAT_ID, '2', NOW);
    expect(attemptsCtx.edits[0]).toContain('Проверьте экзамен');
    expect(attemptsCtx.edits[0]).toContain('Вопросов: 2');
    expect(attemptsCtx.edits[0]).toContain('без лимита');
    expect(attemptsCtx.edits[0]).toContain('Попыток: 2');

    // «Опубликовать».
    const publishCtx = await publish();
    expect(publishCtx.edits[0]).toContain('Экзамен опубликован');
    expect(publishCtx.edits[0]).toContain('/экзамены');

    // Read-after-write — тот же ExamsService, что и кабинет.
    const exams = await flowCtx.flow.ctx.examsService.list({});
    expect(exams).toHaveLength(1);
    expect(exams[0]?.status).toBe('published');
    expect(exams[0]?.title).toBe('Экзамен по третьему уровню');
    expect(exams[0]?.attemptsAllowed).toBe(2);
    expect(exams[0]?.timeLimitMin).toBeUndefined();
    expect(exams[0]?.blocks[0]?.itemIds.sort()).toEqual([itemAId, itemBId].sort());
    const savedId = exams[0]?.id;
    if (!savedId) throw new Error('экзамен не сохранился');
    const found = await flowCtx.flow.ctx.examsService.getById(savedId);
    expect(found.status).toBe('published');

    // Read-after-write, сторона ученика — тот же порт, что у /me/exams.
    const studentExams = await examBot.listMyExams(
      botUser('507f1f77bcf86cd799439099'),
      NOW,
    );
    expect(studentExams.some((e) => e.id === savedId)).toBe(true);

    // Идемпотентность — повторный клик «Опубликовать» не заводит вторую форму.
    const secondPublishCtx = await publish();
    expect(secondPublishCtx.edits[0]).toContain('уже опубликован');
    expect(await flowCtx.flow.ctx.examsService.list({})).toHaveLength(1);
  });

  it('«Отмена» на любом шаге закрывает черновик, не собирая экзамен', async () => {
    await seedNewExamTeacher(flowCtx);
    const { botSessions, ctx: attemptsCtx } = flowCtx.flow;
    await flowCtx.commandHandler.handle(fakeFlowCtx().ctx, NOW);

    const cancelCtx = fakeFlowCtx();
    await handleNewExamCancel(cancelCtx.ctx, botSessions, CHAT_ID);

    expect(cancelCtx.edits[0]).toContain('отменён');
    expect(await botSessions.get(CHAT_ID, NOW)).toBeNull();
    expect(await attemptsCtx.examsService.list({})).toEqual([]);
  });

  it('«Собрать» без единой отметки (устаревшая кнопка) — экран остаётся тем же', async () => {
    await seedNewExamTeacher(flowCtx);
    await publishedFlowItem(flowCtx, 'Вопрос без отметки');
    const { botSessions } = flowCtx.flow;
    await flowCtx.commandHandler.handle(fakeFlowCtx().ctx, NOW);

    const assembleCtx = fakeFlowCtx();
    await handleNewExamAssemble(assembleCtx.ctx, botSessions, CHAT_ID, NOW);

    expect(assembleCtx.edits).toEqual([]);
    const session = await activeSession(botSessions);
    expect(session.buildStep).toBe('pick');
  });

  // Кнопка «Опубликовать» на пустом наборе недостижима из диалога («Собрать»
  // недоступна без отметки) — но правило живёт в сервисе (ADR-0024), не в
  // хендлере: черновик, поправленный мимо шагов диалога, получает тот же
  // отказ, что и пустая форма в кабинете.
  it('«Опубликовать» на пустом наборе (защита в глубину) — отказ сервиса, экзамен не создан', async () => {
    await seedNewExamTeacher(flowCtx);
    const itemId = await publishedFlowItem(flowCtx, 'Вопрос для защиты в глубину');
    const { botSessions, examBot, ctx: attemptsCtx } = flowCtx.flow;
    await flowCtx.commandHandler.handle(fakeFlowCtx().ctx, NOW);
    await handleNewExamToggleItem(
      fakeFlowCtx().ctx,
      botSessions,
      examBot,
      CHAT_ID,
      itemId,
      NOW,
    );
    await handleNewExamAssemble(fakeFlowCtx().ctx, botSessions, CHAT_ID, NOW);
    // В обычном диалоге это невозможно (кнопка «Собрать» недоступна без
    // отметки) — сюда попадаем только если черновик поправили мимо кнопок
    // (тем же приёмом, что «Сохранить» на неполном черновике в
    // new-exam-item-flow.spec.ts). `kind` уже 'examBuildDraft' — сохранён
    // командой выше, setNewExamDraft его не трогает.
    await botSessions.setNewExamDraft(
      CHAT_ID,
      { step: 'confirm', itemIds: [], title: 'Пустой экзамен', attemptsAllowed: 1 },
      NOW,
    );

    const publishCtx = await publish();

    expect(publishCtx.edits[0]).toContain('нет ни одного вопроса');
    // create() уже завёл черновик до отказа публикации — тем же приёмом, что
    // у ExamsService.createAndPublishExam (exams.service.spec.ts): не «ничего
    // не создалось», а «не опубликовалось».
    const exams = await attemptsCtx.examsService.list({});
    expect(exams).toHaveLength(1);
    expect(exams[0]?.status).toBe('draft');
  });

  it('сбой посреди диалога — фраза в чат, черновик не закрывается раньше TTL', async () => {
    await seedNewExamTeacher(flowCtx);
    const itemId = await publishedFlowItem(flowCtx, 'Вопрос для сбоя');
    const { botSessions } = flowCtx.flow;
    await flowCtx.commandHandler.handle(fakeFlowCtx().ctx, NOW);
    await handleNewExamToggleItem(
      fakeFlowCtx().ctx,
      botSessions,
      flowCtx.flow.examBot,
      CHAT_ID,
      itemId,
      NOW,
    );
    await handleNewExamAssemble(fakeFlowCtx().ctx, botSessions, CHAT_ID, NOW);

    const failingBotSessions = {
      get: botSessions.get.bind(botSessions),
      setNewExamDraft: () => Promise.reject(new Error('mongo упал')),
    } as unknown as BotSessionService;
    const failingHandler = new NewExamMessageHandler(
      failingBotSessions,
      flowCtx.flow.registry,
    );
    const titleMsg = textMessage('Название, которое не сохранится из-за сбоя');
    const session = await activeSession(botSessions);

    await expect(
      failingHandler.handle(titleMsg.ctx, CHAT_ID, session, NOW),
    ).resolves.toBeUndefined();

    expect(titleMsg.replies).toEqual([GENERIC_ERROR]);
    // Черновик пережил сбой — TTL, не мгновенная очистка (тем же приёмом,
    // что new-exam-item-flow.spec.ts).
    const survived = await botSessions.get(CHAT_ID, NOW);
    expect(survived?.kind).toBe('examBuildDraft');
    expect(await botSessions.hasExpired(CHAT_ID, NOW.plus({ minutes: 61 }))).toBe(
      'examBuildDraft',
    );
  });
});
