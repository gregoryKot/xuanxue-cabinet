// Против настоящей Mongo (mongodb-memory-server, не мок — CLAUDE.md
// «Тесты»): запросы к базе (фильтр по статусу) проверяются на реальном
// драйвере, а не через мок модели, который пропустил бы ошибку в самом
// запросе. Попытки собираются через настоящий поток сервисов (start/
// saveAnswers/submit) — так же, как их создаёт ученик, а не вставкой в базу
// мимо шифрования.
import { DateTime } from 'luxon';
import type { Model } from 'mongoose';
import type { ExamAttemptDto } from '@xuanxue/shared';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { ExamImageRecord, ExamImageSchema } from '../exam-images/exam-image.schema';
import { ExamImagesService } from '../exam-images/exam-images.service';
import { UserNamesService } from '../users/user-names.service';
import { UserRecord, UserSchema } from '../users/user.schema';
import { ExamAttemptRecord, ExamAttemptSchema } from './exam-attempt.schema';
import { ExamAttemptsService } from './exam-attempts.service';
import { fakeExamNotifier } from './exam-notifier.test-support';
import { ExamGradingRecord, ExamGradingSchema } from './exam-grading.schema';
import { ExamItemStatsService } from './exam-item-stats.service';
import { ExamItemRecord, ExamItemSchema } from './exam-item.schema';
import { ExamItemsService } from './exam-items.service';
import { ExamRecord, ExamSchema } from './exam.schema';
import { ExamsService } from './exams.service';

const NOW = DateTime.utc(2026, 9, 14, 9, 0, 0);
const AUTHOR_ID = '507f1f77bcf86cd799439011';
const USER_A = '507f1f77bcf86cd799439012';
const USER_B = '507f1f77bcf86cd799439013';

describe('ExamItemStatsService', () => {
  let memory: MemoryMongo;
  let attemptModel: Model<ExamAttemptRecord>;
  let itemModel: Model<ExamItemRecord>;
  let examModel: Model<ExamRecord>;
  let examItemsService: ExamItemsService;
  let examsService: ExamsService;
  let attemptsService: ExamAttemptsService;
  let statsService: ExamItemStatsService;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    attemptModel = memory.connection.model<ExamAttemptRecord>(
      ExamAttemptRecord.name,
      ExamAttemptSchema,
    );
    itemModel = memory.connection.model<ExamItemRecord>(
      ExamItemRecord.name,
      ExamItemSchema,
    );
    examModel = memory.connection.model<ExamRecord>(ExamRecord.name, ExamSchema);
    const userModel = memory.connection.model<UserRecord>(UserRecord.name, UserSchema);
    const imageModel = memory.connection.model<ExamImageRecord>(
      ExamImageRecord.name,
      ExamImageSchema,
    );
    const gradingModel = memory.connection.model<ExamGradingRecord>(
      ExamGradingRecord.name,
      ExamGradingSchema,
    );
    const examImagesService = new ExamImagesService(imageModel, attemptModel);
    examItemsService = new ExamItemsService(itemModel, examModel, examImagesService);
    examsService = new ExamsService(examModel, itemModel, attemptModel);
    attemptsService = new ExamAttemptsService(
      attemptModel,
      gradingModel,
      examsService,
      examItemsService,
      new UserNamesService(userModel),
      fakeExamNotifier(),
    );
    statsService = new ExamItemStatsService(
      attemptModel,
      itemModel,
      examModel,
      examItemsService,
    );
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  afterEach(async () => {
    await attemptModel.deleteMany({});
    await itemModel.deleteMany({});
    await examModel.deleteMany({});
  });

  async function createPublishedSingleChoiceItem(): Promise<{
    itemId: string;
    correctOptionId: string;
    wrongOptionId: string;
  }> {
    const created = await examItemsService.create(
      {
        kind: 'single',
        prompt: 'Сколько форм в базовом комплексе?',
        options: [
          { text: 'пять', correct: true },
          { text: 'три', correct: false },
        ],
      },
      AUTHOR_ID,
    );
    await examItemsService.update(created.id, { status: 'published' }, NOW);
    const correctOptionId = created.options.find((o) => o.correct)?.id;
    const wrongOptionId = created.options.find((o) => !o.correct)?.id;
    if (!correctOptionId || !wrongOptionId) throw new Error('варианты не созданы');
    return { itemId: created.id, correctOptionId, wrongOptionId };
  }

  async function createPublishedExam(itemId: string): Promise<string> {
    const created = await examsService.create(
      { title: 'Экзамен для статистики', blocks: [{ itemIds: [itemId] }] },
      AUTHOR_ID,
    );
    await examsService.update(created.id, { status: 'published' });
    return created.id;
  }

  async function submitAnswer(
    examId: string,
    userId: string,
    itemId: string,
    optionIds: string[],
  ): Promise<ExamAttemptDto> {
    const started = await attemptsService.start(examId, userId, NOW);
    await attemptsService.saveAnswers(
      started.id,
      userId,
      { answers: [{ itemId, optionIds }] },
      NOW,
    );
    return attemptsService.submit(started.id, userId, NOW);
  }

  it('вопрос в нескольких сданных попытках, часть ответов верных — askedCount/correctCount/доля/варианты', async () => {
    const { itemId, correctOptionId, wrongOptionId } =
      await createPublishedSingleChoiceItem();
    const examId = await createPublishedExam(itemId);

    await submitAnswer(examId, USER_A, itemId, [correctOptionId]);
    await submitAnswer(examId, USER_B, itemId, [wrongOptionId]);

    const stats = await statsService.getStats(itemId);

    expect(stats.askedCount).toBe(2);
    expect(stats.correctCount).toBe(1);
    expect(stats.correctRate).toBeCloseTo(0.5);
    expect(stats.options).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: correctOptionId, correct: true, chosenCount: 1 }),
        expect.objectContaining({ id: wrongOptionId, correct: false, chosenCount: 1 }),
      ]),
    );
  });

  it('вопрос без вариантов — correctCount/correctRate/options не выдуманы, askedCount честный', async () => {
    const created = await examItemsService.create(
      { kind: 'text', prompt: 'Опишите форму «пэнбу»' },
      AUTHOR_ID,
    );
    await examItemsService.update(created.id, { status: 'published' }, NOW);
    const examId = await createPublishedExam(created.id);
    const started = await attemptsService.start(examId, USER_A, NOW);
    await attemptsService.submit(started.id, USER_A, NOW);

    const stats = await statsService.getStats(created.id);

    expect(stats.askedCount).toBe(1);
    expect(stats.correctCount).toBeUndefined();
    expect(stats.correctRate).toBeUndefined();
    expect(stats.options).toBeUndefined();
  });

  it('вопрос, которого ещё не было ни в одной сданной попытке — askedCount 0, доля не выдумана', async () => {
    const { itemId } = await createPublishedSingleChoiceItem();

    const stats = await statsService.getStats(itemId);

    expect(stats.askedCount).toBe(0);
    expect(stats.correctRate).toBeUndefined();
    expect(stats.options?.every((o) => o.chosenCount === 0)).toBe(true);
  });

  it('попытка «в работе» не в счёт — только сданные попадают в askedCount', async () => {
    const { itemId, correctOptionId } = await createPublishedSingleChoiceItem();
    const examId = await createPublishedExam(itemId);
    const started = await attemptsService.start(examId, USER_A, NOW);
    await attemptsService.saveAnswers(
      started.id,
      USER_A,
      { answers: [{ itemId, optionIds: [correctOptionId] }] },
      NOW,
    );

    const beforeSubmit = await statsService.getStats(itemId);
    expect(beforeSubmit.askedCount).toBe(0);

    await attemptsService.submit(started.id, USER_A, NOW);
    const afterSubmit = await statsService.getStats(itemId);
    expect(afterSubmit.askedCount).toBe(1);
  });

  it('getSummary на пустой базе — 0, не мусор', async () => {
    const summary = await statsService.getSummary();
    expect(summary).toEqual({ strugglingCount: 0 });
  });

  it('getSummary — считает только вопрос, где чаще половины ошибаются', async () => {
    const strugglingItem = await createPublishedSingleChoiceItem();
    const strugglingExamId = await createPublishedExam(strugglingItem.itemId);
    await submitAnswer(strugglingExamId, USER_A, strugglingItem.itemId, [
      strugglingItem.wrongOptionId,
    ]);
    await submitAnswer(strugglingExamId, USER_B, strugglingItem.itemId, [
      strugglingItem.wrongOptionId,
    ]);

    const okItem = await createPublishedSingleChoiceItem();
    const okExamId = await createPublishedExam(okItem.itemId);
    await submitAnswer(okExamId, USER_A, okItem.itemId, [okItem.correctOptionId]);
    await submitAnswer(okExamId, USER_B, okItem.itemId, [okItem.correctOptionId]);

    const summary = await statsService.getSummary();
    expect(summary.strugglingCount).toBe(1);
  });
});
