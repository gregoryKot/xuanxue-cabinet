// Сверка уникальных индексов из docs/PLAN.md §4 «Модель данных» с реальной
// Mongo (mongodb-memory-server, не мок — CLAUDE.md «Тесты»: мок пропускает
// ошибки самого запроса). `api/src/common/model.registry.spec.ts` уже
// проверяет часть этих индексов поведением (create/create → E11000); здесь —
// явный список из PLAN, читаемый через `collection.indexes()`: видно, ЧТО
// именно подтверждено, а что нет, без чтения кода тест-файла.
import mongoose, { type Connection } from 'mongoose';
import { MODEL_DEFINITIONS } from '../common/model.registry';
import { MONGO_DUPLICATE_KEY_CODE } from '../common/mongo-error-codes';
import { DeliveryRecord } from '../deliveries/delivery.schema';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';

interface ExpectedUniqueIndex {
  collection: string;
  key: Record<string, 1 | -1>;
  partialFilterExpression?: Record<string, unknown>;
  /** Откуда взят индекс — строка PLAN §4/§2, а не пересказ кода. */
  source: string;
}

// Список — только то, что PLAN §4 называет уникальным. Новый уникальный
// индекс в схеме без строки в PLAN §4 — повод дописать PLAN, не этот список.
const EXPECTED_UNIQUE_INDEXES: readonly ExpectedUniqueIndex[] = [
  {
    collection: 'deliveries',
    key: { broadcastId: 1, channelId: 1 },
    source: 'PLAN §4 deliveries: «Уникальный индекс (broadcastId, channelId)»',
  },
  {
    collection: 'broadcasts',
    key: { lessonId: 1, kind: 1 },
    partialFilterExpression: { kind: 'lesson_link', lessonId: { $type: 'objectId' } },
    source: 'PLAN §4 broadcasts: «(lessonId, kind) для lesson_link»',
  },
  {
    collection: 'broadcasts',
    key: { lessonId: 1, recordingKey: 1 },
    partialFilterExpression: { kind: 'recording', recordingKey: { $type: 'string' } },
    source: 'PLAN §4 broadcasts: «(lessonId, recordingKey) для recording»',
  },
  {
    collection: 'bot_sessions',
    key: { chatId: 1 },
    source: 'PLAN §4 bot_sessions: «Уникальный индекс chatId»',
  },
  {
    collection: 'channels',
    key: { type: 1, target: 1 },
    partialFilterExpression: { target: { $gt: '' } },
    source: 'PLAN §4 channels: «уникальный частичный индекс (type, target)»',
  },
  {
    collection: 'users',
    key: { telegramId: 1 },
    partialFilterExpression: { telegramId: { $type: 'number' } },
    source: 'PLAN §4 users: «один ключ входа = одна учётная запись» (SECURITY §2)',
  },
  {
    collection: 'lessons',
    key: { classId: 1, plannedAt: 1 },
    partialFilterExpression: { plannedAt: { $type: 'date' } },
    source: 'PLAN §4 lessons: «уникальный частичный индекс (classId, plannedAt)»',
  },
  {
    collection: 'notification_prefs',
    key: { userId: 1 },
    source:
      'PLAN §4/§13 notification_prefs: «Уникальный индекс userId, один документ на человека»',
  },
];

describe('Уникальные индексы из PLAN §4 существуют в Mongo', () => {
  let memory: MemoryMongo;
  let connection: Connection;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    for (const def of MODEL_DEFINITIONS) connection.model(def.name, def.schema);
    await Promise.all(Object.values(connection.models).map((m) => m.syncIndexes()));
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  it.each(EXPECTED_UNIQUE_INDEXES)('$collection: $source', async (expected) => {
    const indexes = await connection.collection(expected.collection).indexes();
    const found = indexes.find(
      (idx) => JSON.stringify(idx.key) === JSON.stringify(expected.key),
    );
    expect(found).toBeDefined();
    expect(found?.unique).toBe(true);
    if (expected.partialFilterExpression) {
      expect(found?.partialFilterExpression).toEqual(expected.partialFilterExpression);
    }
  });

  // PLAN.md §6 «Тесты, без которых этап не закрыт»: «Уникальность доставки:
  // второй insert с тем же (broadcastId, channelId) падает» — прямой тест
  // поверх сверки списка выше, а не только чтение метаданных индекса.
  it('deliveries: второй insert с тем же (broadcastId, channelId) падает с E11000', async () => {
    const Delivery = connection.model<DeliveryRecord>(DeliveryRecord.name);
    const broadcastId = new mongoose.Types.ObjectId();
    const channelId = new mongoose.Types.ObjectId();
    await Delivery.create({ broadcastId, channelId });
    await expect(Delivery.create({ broadcastId, channelId })).rejects.toMatchObject({
      code: MONGO_DUPLICATE_KEY_CODE,
    });
  });
});
