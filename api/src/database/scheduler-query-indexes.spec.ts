// Запросы тиков планировщика обязаны ходить по индексу: тик идёт раз в
// минуту, и FETCH всей коллекции на каждом тике — скрытый скан, которого не
// видно ни в тестах поведения, ни в unique-indexes.spec.ts (тот сверяет только
// уникальные индексы из PLAN §4). Аудит 2026-10-01, F58: запрос
// closeExpiredAttempts шёл по deadlineAt без индекса. F54 (ревью PR #525):
// запрос уборки картинок при индексе `{ createdAt: 1 }` шёл планом FETCH и
// каждую минуту читал каждую картинку целиком, вместе с `bytes`. Проверка — explain()
// против настоящей Mongo (mongodb-memory-server, не мок — CLAUDE.md «Тесты»):
// план обязан начинаться с IXSCAN нужного индекса, а документов, прочитанных
// целиком, при кандидатах «мимо фильтра» быть не должно.
import { DateTime } from 'luxon';
import type { Connection, Model } from 'mongoose';
import { Types } from 'mongoose';
import { orphanImageCandidatesQuery } from '../exam-images/exam-image-sweep.service';
import { ExamImageRecord } from '../exam-images/exam-image.schema';
import { ExamAttemptRecord } from '../exams/exam-attempt.schema';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';

const NOW = DateTime.utc(2026, 10, 2, 12, 0, 0);
// Столько же, сколько DEADLINE_BATCH_LIMIT у ExamDeadlineCloseService — сам
// лимит здесь не важен, важен план.
const BATCH_LIMIT = 50;
// Больше SWEEP_BATCH_LIMIT: в нормальном состоянии все старые картинки
// используются, и запрос не возвращает ничего, сколько бы их ни было.
const USED_IMAGES_COUNT = 60;
const DAY_MS = 24 * 60 * 60 * 1000;

interface ExplainStage {
  stage: string;
  indexName?: string;
  inputStage?: ExplainStage;
}

interface ExplainResult {
  queryPlanner: { winningPlan: ExplainStage };
  executionStats: { totalDocsExamined: number };
}

function stagesOf(plan: ExplainStage): ExplainStage[] {
  return plan.inputStage ? [plan, ...stagesOf(plan.inputStage)] : [plan];
}

describe('Запросы тиков планировщика ходят по индексу', () => {
  let memory: MemoryMongo;
  let connection: Connection;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  it('closeExpiredAttempts: { status, deadlineAt } — IXSCAN status_1_deadlineAt_1, документов не читает', async () => {
    const attempts = connection.model<ExamAttemptRecord>(ExamAttemptRecord.name);
    await seedInProgress(attempts, NOW.plus({ hours: 1 }));
    await seedInProgress(attempts, NOW.plus({ hours: 2 }));

    const explain = (await attempts
      .find({ status: 'in_progress', deadlineAt: { $lte: NOW.toJSDate() } })
      .limit(BATCH_LIMIT)
      .explain('executionStats')) as unknown as ExplainResult;

    const ixscan = stagesOf(explain.queryPlanner.winningPlan).find(
      (stage) => stage.stage === 'IXSCAN',
    );
    expect(ixscan?.indexName).toBe('status_1_deadlineAt_1');
    expect(explain.executionStats.totalDocsExamined).toBe(0);
  });

  // Нормальное состояние: все картинки старше суток используются, сирот нет.
  // Запрос обязан отсеять их по ключам индекса, не читая документы (в них
  // `bytes`). Строится той же функцией, что и в ExamImageSweepService.
  it('уборка картинок: { createdAt, _id } — IXSCAN createdAt_1__id_1, документов не читает', async () => {
    const images = connection.model<ExamImageRecord>(ExamImageRecord.name);
    const old = new Date(NOW.toMillis() - 2 * DAY_MS);
    const fresh = new Date(NOW.toMillis() - 60 * 60 * 1000);
    const { insertedIds } = await images.collection.insertMany([
      ...Array.from({ length: USED_IMAGES_COUNT }, () => rawImage(old)),
      rawImage(fresh),
    ]);
    const used = Object.values(insertedIds).slice(0, USED_IMAGES_COUNT);
    const boundary = NOW.minus({ hours: 24 }).toJSDate();

    const explain = (await orphanImageCandidatesQuery(images, boundary, used).explain(
      'executionStats',
    )) as unknown as ExplainResult;

    const ixscan = stagesOf(explain.queryPlanner.winningPlan).find(
      (stage) => stage.stage === 'IXSCAN',
    );
    expect(ixscan?.indexName).toBe('createdAt_1__id_1');
    expect(explain.executionStats.totalDocsExamined).toBe(0);
  });
});

// Сырой документ, мимо timestamps-плагина Mongoose: он стирает явный createdAt.
function rawImage(createdAt: Date) {
  return {
    bytes: Buffer.alloc(1024, 1),
    contentType: 'image/jpeg',
    sizeBytes: 1024,
    createdAt,
    updatedAt: createdAt,
  };
}

async function seedInProgress(
  attempts: Model<ExamAttemptRecord>,
  deadlineAt: DateTime,
): Promise<void> {
  await attempts.create({
    examId: new Types.ObjectId(),
    examTitle: 'Экзамен',
    userId: new Types.ObjectId(),
    attemptNo: 1,
    status: 'in_progress',
    startedAt: NOW.toJSDate(),
    deadlineAt: deadlineAt.toJSDate(),
  });
}
