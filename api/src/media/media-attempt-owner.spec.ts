// Против настоящей Mongo (mongodb-memory-server): проверяются защитные
// ветки одного запроса — чужой формат id, исчезнувшая попытка и поля, которые
// не расшифровались. Раньше эти ветки исполнялись только попутно, из тестов
// MediaAssetsService, и покрытие зависело от того, каким путём пошёл
// вызывающий (подъём драйвера mongodb до 7.6 это и обнажил).
import type { Connection, Model } from 'mongoose';
import { Types } from 'mongoose';
import {
  ExamAttemptRecord,
  ExamAttemptSchema,
  type AttemptBlockRecord,
} from '../exams/exam-attempt.schema';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { loadAttemptOwnerInfo } from './media-attempt-owner';

const BLOCKS: AttemptBlockRecord[] = [
  {
    id: 'b1',
    title: 'Блок 1',
    questions: [
      { itemId: 'i1', version: 1, kind: 'video', prompt: 'форма', options: [] },
    ],
  },
];

describe('loadAttemptOwnerInfo', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let attemptModel: Model<ExamAttemptRecord>;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    attemptModel = connection.model<ExamAttemptRecord>(
      ExamAttemptRecord.name,
      ExamAttemptSchema,
    );
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  afterEach(async () => {
    await attemptModel.deleteMany({});
  });

  async function createAttempt(fields: {
    examTitle: string;
    blocks: string;
    status?: 'in_progress' | 'submitted' | 'graded';
  }): Promise<string> {
    const doc = await attemptModel.create({
      userId: new Types.ObjectId(),
      examId: new Types.ObjectId(),
      examTitle: fields.examTitle,
      status: fields.status ?? 'in_progress',
      attemptNo: 1,
      startedAt: new Date('2026-09-18T10:00:00.000Z'),
      blocks: fields.blocks,
      answers: '[]',
    });
    return doc._id.toString();
  }

  it('id не похож на ObjectId — null, без похода в базу', async () => {
    await expect(loadAttemptOwnerInfo(attemptModel, 'не-id')).resolves.toBeNull();
  });

  it('попытки с таким id нет — null', async () => {
    const missing = new Types.ObjectId().toString();

    await expect(loadAttemptOwnerInfo(attemptModel, missing)).resolves.toBeNull();
  });

  it('название и блоки читаются из попытки', async () => {
    const id = await createAttempt({
      examTitle: 'Экзамен на пояс',
      blocks: JSON.stringify(BLOCKS),
    });

    const info = await loadAttemptOwnerInfo(attemptModel, id);

    expect(info?.examTitle).toBe('Экзамен на пояс');
    expect(info?.blocks).toEqual(BLOCKS);
  });

  // ADR-0086: addLink запрещает замену ссылки после graded — статус обязан
  // дойти до сервиса тем же запросом, что владелец и снимок, не вторым
  // походом в базу.
  it('статус попытки читается плоским полем, без расшифровки', async () => {
    const id = await createAttempt({
      examTitle: 'Экзамен',
      blocks: JSON.stringify(BLOCKS),
      status: 'graded',
    });

    const info = await loadAttemptOwnerInfo(attemptModel, id);

    expect(info?.status).toBe('graded');
  });

  it('блоки не разобрались — пустой список, а не падение', async () => {
    const id = await createAttempt({ examTitle: 'Экзамен', blocks: 'не json' });

    const info = await loadAttemptOwnerInfo(attemptModel, id);

    expect(info?.blocks).toEqual([]);
  });
});
