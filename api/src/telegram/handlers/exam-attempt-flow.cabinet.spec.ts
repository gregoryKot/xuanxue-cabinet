// PLAN.md §12 «Тесты, без которых этап не закрыт», пп. 1, 2 и 4 — бот и
// кабинет как два клиента ОДНОЙ попытки против настоящей Mongo
// (mongodb-memory-server, не мок — CLAUDE.md «Тесты»): «кабинет» здесь —
// прямой вызов ExamAttemptsService (ExamAttemptsController зовёт ровно его,
// exam-attempts.controller.spec.ts), «бот» — хендлеры поверх настоящего
// ExamBotService. Обвязка — exam-attempt-flow.test-support.ts.
import { DateTime } from 'luxon';
import { ATTEMPT_EXPIRED_MESSAGE } from '@xuanxue/shared';
import { activeAccess, fakeBotUserAccess } from '../bot-user-access.service.test-support';
import { USER_A } from '../../exams/exam-attempts.test-support';
import { handleExamOption, handleExamSubmit } from './exam-attempt-answer';
import {
  botUser,
  CHAT_ID,
  clearFlowTest,
  fakeFlowCtx,
  publishedFlowExam,
  setupFlowTest,
  type FlowTestContext,
} from './exam-attempt-flow.test-support';
import { handleExamStart } from './exam-attempt-navigation';
import { ExamTextAnswerHandler } from './exam-text-answer.handler';
import { GENERIC_ERROR } from './callback-actions';

const NOW = DateTime.utc(2026, 9, 12, 10, 0, 0);
const TIME_LIMIT_MIN = 30;
// EXAM_ANSWER_WAIT_HOURS (exam-answer-wait.ts) — столько живёт ожидание
// ответа в bot_sessions без единого сообщения от ученика.
const WAIT_HOURS = 12;

describe('бот и кабинет — одна попытка (интеграция, Mongo)', () => {
  let flow: FlowTestContext;

  beforeAll(async () => {
    flow = await setupFlowTest();
  }, 60_000);

  afterAll(async () => {
    await flow.ctx.memory.stop();
  });

  afterEach(async () => {
    await clearFlowTest(flow);
  });

  async function ownAttemptId(): Promise<string> {
    const attempts = await flow.ctx.service.list({}, botUser(USER_A), NOW);
    const id = attempts[0]?.id;
    if (!id) throw new Error('попытка не найдена');
    return id;
  }

  it('ответ из бота и ответ из кабинета попадают в одну попытку и не затирают друг друга', async () => {
    const { examId, itemIds } = await publishedFlowExam(
      flow.ctx,
      ['single', 'text'],
      NOW,
    );
    const [singleId, textId] = itemIds;

    // Кабинет начал попытку; бот со своим «Начать» получает её же, не вторую.
    const fromCabinet = await flow.ctx.service.start(examId, USER_A, NOW);
    const start = fakeFlowCtx();
    await handleExamStart(
      start.ctx,
      flow.examBot,
      flow.botSessions,
      botUser(USER_A),
      CHAT_ID,
      examId,
      NOW,
    );
    expect(start.edits[0]).toContain('Вопрос 1 из 2');
    await expect(flow.ctx.attemptModel.countDocuments({ examId })).resolves.toBe(1);

    // Вопрос 1 — из бота, вопрос 2 — из кабинета.
    await handleExamOption(
      fakeFlowCtx().ctx,
      flow.examBot,
      flow.botSessions,
      botUser(USER_A),
      CHAT_ID,
      { attemptId: fromCabinet.id, questionIndex: 0, optionIndex: 0 },
      NOW.plus({ minutes: 1 }),
    );
    await flow.ctx.service.saveAnswers(
      fromCabinet.id,
      USER_A,
      { answers: [{ itemId: textId ?? '', text: 'из кабинета' }] },
      NOW.plus({ minutes: 2 }),
    );

    const [merged] = await flow.ctx.service.list(
      {},
      botUser(USER_A),
      NOW.plus({ minutes: 3 }),
    );
    expect(merged?.id).toBe(fromCabinet.id);
    expect(merged?.answers).toHaveLength(2);
    expect(merged?.answers.find((a) => a.itemId === singleId)?.optionIds).toHaveLength(1);
    expect(merged?.answers.find((a) => a.itemId === textId)?.text).toBe('из кабинета');

    // Бот переотвечает на свой вопрос — ответ кабинета на месте.
    await handleExamOption(
      fakeFlowCtx().ctx,
      flow.examBot,
      flow.botSessions,
      botUser(USER_A),
      CHAT_ID,
      { attemptId: fromCabinet.id, questionIndex: 0, optionIndex: 1 },
      NOW.plus({ minutes: 4 }),
    );
    const [after] = await flow.ctx.service.list(
      {},
      botUser(USER_A),
      NOW.plus({ minutes: 5 }),
    );
    expect(after?.answers.find((a) => a.itemId === textId)?.text).toBe('из кабинета');
    expect(after?.answers).toHaveLength(2);
  });

  it('дедлайн в боте закрывает попытку так же, как в кабинете — тот же сервис, тот же статус и текст', async () => {
    const { examId } = await publishedFlowExam(flow.ctx, ['single'], NOW, {
      timeLimitMin: TIME_LIMIT_MIN,
    });
    await handleExamStart(
      fakeFlowCtx().ctx,
      flow.examBot,
      flow.botSessions,
      botUser(USER_A),
      CHAT_ID,
      examId,
      NOW,
    );
    const attemptId = await ownAttemptId();
    const late = NOW.plus({ minutes: TIME_LIMIT_MIN + 1 });

    // Нажатие варианта после дедлайна — экран «время вышло», ответ не сохранён.
    const option = fakeFlowCtx();
    await handleExamOption(
      option.ctx,
      flow.examBot,
      flow.botSessions,
      botUser(USER_A),
      CHAT_ID,
      { attemptId, questionIndex: 0, optionIndex: 0 },
      late,
    );
    expect(option.edits).toEqual([ATTEMPT_EXPIRED_MESSAGE]);

    // В базе — то же, что оставил бы кабинет: submitted, expired, submittedAt = дедлайн.
    const [closed] = await flow.ctx.service.list({}, botUser(USER_A), late);
    expect(closed).toMatchObject({ status: 'submitted', expired: true, answers: [] });
    expect(closed?.submittedAt).toBe(closed?.deadlineAt);
    // Уведомление учителю ушло один раз — как при обычной сдаче (слой 4.7).
    expect(flow.ctx.examNotifier.notifyAttemptSubmitted).toHaveBeenCalledTimes(1);

    // «Сдать» в боте после дедлайна — тот же отказ, что в кабинете
    // (ExamAttemptsService.submit → ATTEMPT_EXPIRED_MESSAGE).
    const submit = fakeFlowCtx();
    await handleExamSubmit(
      submit.ctx,
      flow.examBot,
      flow.botSessions,
      botUser(USER_A),
      CHAT_ID,
      attemptId,
      late,
    );
    expect(submit.edits).toEqual([ATTEMPT_EXPIRED_MESSAGE]);
    await expect(flow.ctx.service.submit(attemptId, USER_A, late)).rejects.toThrow(
      ATTEMPT_EXPIRED_MESSAGE,
    );
    expect(flow.ctx.examNotifier.notifyAttemptSubmitted).toHaveBeenCalledTimes(1);
  });

  it('хендлер упал на середине диалога — в чат понятная фраза, ожидание не вечное (TTL)', async () => {
    const { examId } = await publishedFlowExam(flow.ctx, ['text'], NOW);
    await handleExamStart(
      fakeFlowCtx().ctx,
      flow.examBot,
      flow.botSessions,
      botUser(USER_A),
      CHAT_ID,
      examId,
      NOW,
    );
    const session = await flow.botSessions.get(CHAT_ID, NOW);
    expect(session?.kind).toBe('examText');
    if (!session) throw new Error('unreachable');

    // Сохранение упало не доменной ошибкой (база отвалилась) посреди диалога.
    jest
      .spyOn(flow.examBot, 'saveAnswer')
      .mockRejectedValueOnce(new Error('MongoNetworkError: connection closed'));
    const textHandler = new ExamTextAnswerHandler(
      flow.botSessions,
      fakeBotUserAccess(activeAccess(botUser(USER_A))),
      flow.registry,
    );
    const message = fakeFlowCtx({ text: 'Форма выглядит так' });
    await textHandler.handle(message.ctx, CHAT_ID, session, NOW);

    expect(message.replies).toEqual([GENERIC_ERROR]);
    const [attempt] = await flow.ctx.service.list({}, botUser(USER_A), NOW);
    expect(attempt?.answers).toEqual([]);

    // Ожидание пережило сбой (ученик может ответить ещё раз), но не навсегда:
    // после TTL get() его уже не отдаёт — MessageHandler не примет
    // сообщение за ответ, hasExpired() знает, что ожидание было.
    await expect(
      flow.botSessions.get(CHAT_ID, NOW.plus({ hours: 1 })),
    ).resolves.not.toBeNull();
    const afterTtl = NOW.plus({ hours: WAIT_HOURS, minutes: 1 });
    await expect(flow.botSessions.get(CHAT_ID, afterTtl)).resolves.toBeNull();
    await expect(flow.botSessions.hasExpired(CHAT_ID, afterTtl)).resolves.toBe(
      'examText',
    );
  });
});
