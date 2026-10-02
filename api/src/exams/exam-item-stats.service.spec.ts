// Против настоящей Mongo (mongodb-memory-server, не мок — CLAUDE.md
// «Тесты»): запросы к базе (фильтр по статусу) проверяются на реальном
// драйвере, а не через мок модели, который пропустил бы ошибку в самом
// запросе. Попытки собираются через настоящий поток сервисов (start/
// saveAnswers/submit) — так же, как их создаёт ученик, а не вставкой в базу
// мимо шифрования.
import { Logger } from '@nestjs/common';
import { DateTime } from 'luxon';
import type { Model } from 'mongoose';
import type { ExamAttemptDto } from '@xuanxue/shared';
import { MONGO_OPERATION_TIMEOUT_MS } from '../database/mongoose-options';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { ExamImageRecord, ExamImageSchema } from '../exam-images/exam-image.schema';
import { ExamImagesService } from '../exam-images/exam-images.service';
import { UserNamesService } from '../users/user-names.service';
import { UserRecord, UserSchema } from '../users/user.schema';
import { MediaAssetRecord, MediaAssetSchema } from '../media/media-asset.schema';
import {
  NotificationRecord,
  NotificationSchema,
} from '../notifications/notification.schema';
import { ExamAttemptRecord, ExamAttemptSchema } from './exam-attempt.schema';
import { ExamAttemptRetryCleanupService } from './exam-attempt-retry-cleanup.service';
import { ExamAttemptsService } from './exam-attempts.service';
import { fakeExamNotifier } from './exam-notifier.test-support';
import { ExamGradingRecord, ExamGradingSchema } from './exam-grading.schema';
import { decryptAttempt, type RawLeanExamAttempt } from './exam-attempt.mapper';
import { accumulateAttemptStats } from './exam-item-stats-accumulate';
import { computeExamItemStats } from './exam-item-stats';
import { ExamItemStatsService } from './exam-item-stats.service';
import { ExamItemRecord, ExamItemSchema } from './exam-item.schema';
import { ExamItemsService } from './exam-items.service';
import { ExamRecord, ExamSchema } from './exam.schema';
import { ExamsService } from './exams.service';
import { fakeExamVideosService } from '../test-support/fake-exam-videos-service';

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
    const mediaModel = memory.connection.model<MediaAssetRecord>(
      MediaAssetRecord.name,
      MediaAssetSchema,
    );
    const notificationModel = memory.connection.model<NotificationRecord>(
      NotificationRecord.name,
      NotificationSchema,
    );
    const examImagesService = new ExamImagesService(imageModel, attemptModel);
    examItemsService = new ExamItemsService(
      itemModel,
      examModel,
      examImagesService,
      fakeExamVideosService(),
    );
    examsService = new ExamsService(examModel, itemModel, attemptModel);
    attemptsService = new ExamAttemptsService(
      attemptModel,
      gradingModel,
      examsService,
      itemModel,
      new UserNamesService(userModel),
      fakeExamNotifier(),
      new ExamAttemptRetryCleanupService(
        attemptModel,
        mediaModel,
        notificationModel,
        gradingModel,
      ),
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

  // askReason (ADR-0146) по умолчанию выключен — большинство тестов файла его
  // не касаются; тесты reasonCount/reasonAnsweredCount передают true явно.
  async function createPublishedSingleChoiceItem(askReason = false): Promise<{
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
        askReason,
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
    await examsService.update(created.id, { status: 'published' }, NOW);
    return created.id;
  }

  async function submitAnswer(
    examId: string,
    userId: string,
    itemId: string,
    optionIds: string[],
    // Объяснение выбора (ADR-0146) — необязательно, большинство вызовов его
    // не касаются.
    text?: string,
  ): Promise<ExamAttemptDto> {
    const started = await attemptsService.start(examId, userId, NOW);
    await attemptsService.saveAnswers(
      started.id,
      userId,
      { answers: [{ itemId, optionIds, text }] },
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

  // ADR-0146: askReason включили не с первой попытки (реалистичный порядок —
  // учитель обычно замечает угадывания уже по ходу дела) — вариант без
  // объяснения из времени ДО включения флага всё равно входит в знаменатель
  // (вариант выбран), но не в числитель (объяснения не писали, поля ещё не
  // было). Явный отказ submit() при включённом askReason проверен в
  // exam-attempt-ask-reason.e2e-spec.ts — здесь только счёт по готовым данным.
  it('reasonCount/reasonAnsweredCount — часть попыток без объяснения (askReason включили позже)', async () => {
    const { itemId, correctOptionId, wrongOptionId } =
      await createPublishedSingleChoiceItem();
    const examId = await createPublishedExam(itemId);

    await submitAnswer(examId, USER_A, itemId, [wrongOptionId]);
    await examItemsService.update(itemId, { askReason: true }, NOW);
    await submitAnswer(
      examId,
      USER_B,
      itemId,
      [correctOptionId],
      'Потому что пять — правильный счёт',
    );

    const stats = await statsService.getStats(itemId);

    expect(stats.reasonAnsweredCount).toBe(2);
    expect(stats.reasonCount).toBe(1);
  });

  it('askReason выключен — reasonCount/reasonAnsweredCount не выдуманы', async () => {
    const { itemId, correctOptionId } = await createPublishedSingleChoiceItem();
    const examId = await createPublishedExam(itemId);
    await submitAnswer(examId, USER_A, itemId, [correctOptionId]);

    const stats = await statsService.getStats(itemId);

    expect(stats.reasonCount).toBeUndefined();
    expect(stats.reasonAnsweredCount).toBeUndefined();
  });

  it('askReason включён, вариант ни разу не выбирали — 0 из 0, не мусор', async () => {
    const { itemId } = await createPublishedSingleChoiceItem(true);

    const stats = await statsService.getStats(itemId);

    expect(stats.reasonAnsweredCount).toBe(0);
    expect(stats.reasonCount).toBe(0);
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

  it('getSummary — удалённый вопрос (ADR-0140) не в счёте, даже если ему чаще отвечают неверно', async () => {
    const strugglingItem = await createPublishedSingleChoiceItem();
    const strugglingExamId = await createPublishedExam(strugglingItem.itemId);
    await submitAnswer(strugglingExamId, USER_A, strugglingItem.itemId, [
      strugglingItem.wrongOptionId,
    ]);
    await submitAnswer(strugglingExamId, USER_B, strugglingItem.itemId, [
      strugglingItem.wrongOptionId,
    ]);
    await examItemsService.remove(strugglingItem.itemId, NOW);

    const summary = await statsService.getSummary();
    expect(summary.strugglingCount).toBe(0);
  });

  // Аудит 2026-10-01, F32: статистика не тянет попытки целиком — только
  // `blocks`/`answers`, батчами курсора. Проекция проверяется на самом
  // запросе (шпион на find), а равенство результата — расчётом «как раньше»:
  // все попытки одним списком, без проекции.
  describe('F32 — проекция и батчи не меняют результат', () => {
    it('find по попыткам запрашивает только blocks и answers', async () => {
      const { itemId, correctOptionId } = await createPublishedSingleChoiceItem();
      const examId = await createPublishedExam(itemId);
      await submitAnswer(examId, USER_A, itemId, [correctOptionId]);
      const findSpy = jest.spyOn(attemptModel, 'find');

      await statsService.getSummary();

      expect(findSpy).toHaveBeenCalledTimes(1);
      const query = findSpy.mock.results[0]?.value as { projection: () => unknown };
      expect(query.projection()).toEqual({ blocks: 1, answers: 1 });
      findSpy.mockRestore();
    });

    // Ревью #535 к F32: у обычного курсора `timeoutMode` по умолчанию
    // `cursorLifetime` — весь проход с расшифровкой обязан был бы уложиться в
    // MONGO_OPERATION_TIMEOUT_MS. Проверяется то, что дошло до драйвера
    // (`collection.find`), а не вызов `.cursor()` в Mongoose: без явного
    // `timeoutMS` драйвер `timeoutMode` отвергает, а у тестовой Mongo
    // клиентского `timeoutMS` нет — оба параметра должны стоять на запросе.
    it('курсор идёт с потаймаутом на итерацию, и параметры доходят до драйвера', async () => {
      const { itemId, correctOptionId } = await createPublishedSingleChoiceItem();
      const examId = await createPublishedExam(itemId);
      await submitAnswer(examId, USER_A, itemId, [correctOptionId]);
      const driverFindSpy = jest.spyOn(attemptModel.collection, 'find');

      const summary = await statsService.getSummary();

      expect(summary).toEqual({ strugglingCount: 0 });
      expect(driverFindSpy).toHaveBeenCalledTimes(1);
      expect(driverFindSpy.mock.calls[0]?.[1]).toMatchObject({
        batchSize: 100,
        timeoutMS: MONGO_OPERATION_TIMEOUT_MS,
        timeoutMode: 'iteration',
      });
      driverFindSpy.mockRestore();
    });

    it('результат совпадает с расчётом по полному списку попыток', async () => {
      const { itemId, correctOptionId, wrongOptionId } =
        await createPublishedSingleChoiceItem(true);
      const examId = await createPublishedExam(itemId);
      await submitAnswer(examId, USER_A, itemId, [correctOptionId], 'потому что');
      await submitAnswer(examId, USER_B, itemId, [wrongOptionId], 'показалось');

      const docs = await attemptModel
        .find({ status: { $in: ['submitted', 'graded'] } })
        .lean<RawLeanExamAttempt[]>();
      const item = await examItemsService.getById(itemId);
      const expected = computeExamItemStats(
        item,
        accumulateAttemptStats(docs.map((doc) => decryptAttempt(doc))),
      );

      await expect(statsService.getStats(itemId)).resolves.toEqual({
        ...expected,
        usedInExamsCount: 1,
      });
      expect(expected.askedCount).toBe(2);
    });
  });

  // Аудит 2026-10-01, F55 (ревью #529): попытка, которую не расшифровать
  // (чужой ключ, испорченный blob), роняла статистику вопроса целиком — 500
  // для учителя при каждом открытии, пока битая строка лежит в базе.
  describe('F55 — битая попытка не роняет статистику', () => {
    it('курсор пропускает битую попытку: считает по остальным, одна строка error-лога с её id', async () => {
      const { itemId, correctOptionId } = await createPublishedSingleChoiceItem();
      const examId = await createPublishedExam(itemId);
      const broken = await submitAnswer(examId, USER_A, itemId, [correctOptionId]);
      await submitAnswer(examId, USER_B, itemId, [correctOptionId]);
      await attemptModel.updateOne(
        { _id: broken.id },
        { $set: { blocks: 'не blob и не массив' } },
      );
      const errorLog = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);

      const stats = await statsService.getStats(itemId);

      expect(stats.askedCount).toBe(1);
      expect(stats.correctCount).toBe(1);
      expect(errorLog).toHaveBeenCalledTimes(1);
      expect(String(errorLog.mock.calls[0]?.[0])).toContain(broken.id);
      errorLog.mockRestore();
    });
  });

  // Аудит 2026-10-01, F62: учитель заменил вариант у опубликованного вопроса
  // после сдач — выборы старого варианта остаются в статистике отдельной
  // строкой с текстом из истории редакций (сервис передаёт DTO с history).
  describe('F62 — вариант заменили после сдач', () => {
    it('старый вариант — строка с текстом из прошлой редакции и removed', async () => {
      const { itemId, correctOptionId, wrongOptionId } =
        await createPublishedSingleChoiceItem();
      const examId = await createPublishedExam(itemId);
      await submitAnswer(examId, USER_A, itemId, [wrongOptionId]);
      await submitAnswer(examId, USER_B, itemId, [correctOptionId]);
      await examItemsService.update(
        itemId,
        {
          options: [
            { id: correctOptionId, text: 'пять', correct: true },
            { text: 'четыре', correct: false },
          ],
        },
        NOW,
      );

      const stats = await statsService.getStats(itemId);

      expect(stats.options).toContainEqual({
        id: wrongOptionId,
        text: 'три',
        correct: false,
        chosenCount: 1,
        removed: true,
      });
      expect(stats.options?.find((o) => o.text === 'четыре')).toMatchObject({
        chosenCount: 0,
      });
      const chosenTotal = (stats.options ?? []).reduce(
        (sum, o) => sum + o.chosenCount,
        0,
      );
      expect(chosenTotal).toBe(stats.askedCount);
    });
  });
});
