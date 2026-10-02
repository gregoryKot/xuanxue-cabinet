// Аудит 2026-10-01 (F26): бот читает свою попытку одним findOne по id и
// владельцу (ExamAttemptsService.getOwn, ADR-0126), а не списком из 200 с
// поиском на клиенте. Настоящая Mongo и настоящий ExamBotService — обвязка
// exam-attempt-flow.test-support.ts; число запросов — шпионом на модели.
import { DateTime } from 'luxon';
import { USER_A, USER_B } from '../../exams/exam-attempts.test-support';
import {
  botUser,
  clearFlowTest,
  publishedFlowExam,
  setupFlowTest,
  type FlowTestContext,
} from './exam-attempt-flow.test-support';

const NOW = DateTime.utc(2026, 10, 2, 10, 0, 0);

describe('ExamBotService.loadOwnAttempt — одна попытка по id, не список', () => {
  let flow: FlowTestContext;

  beforeAll(async () => {
    flow = await setupFlowTest();
  }, 60_000);

  afterAll(async () => {
    await flow.ctx.memory.stop();
  });

  afterEach(async () => {
    await clearFlowTest(flow);
    jest.restoreAllMocks();
  });

  it('своя попытка — один findOne, ни одного find; media подмешаны', async () => {
    const { examId } = await publishedFlowExam(flow.ctx, ['single'], NOW);
    const started = await flow.ctx.service.start(examId, USER_A, NOW);
    const find = jest.spyOn(flow.ctx.attemptModel, 'find');
    const findOne = jest.spyOn(flow.ctx.attemptModel, 'findOne');

    const loaded = await flow.examBot.loadOwnAttempt(started.id, botUser(USER_A), NOW);

    expect(loaded).toMatchObject({ id: started.id, status: 'in_progress', media: [] });
    expect(find).not.toHaveBeenCalled();
    expect(findOne).toHaveBeenCalledTimes(1);
  });

  it('чужой или битый id — null, не исключение (SECURITY §3)', async () => {
    const { examId } = await publishedFlowExam(flow.ctx, ['single'], NOW);
    const started = await flow.ctx.service.start(examId, USER_A, NOW);

    await expect(
      flow.examBot.loadOwnAttempt(started.id, botUser(USER_B), NOW),
    ).resolves.toBeNull();
    await expect(
      flow.examBot.loadOwnAttempt('not-an-object-id', botUser(USER_A), NOW),
    ).resolves.toBeNull();
  });
});
