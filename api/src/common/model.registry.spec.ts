// Реестр моделей против настоящей Mongo (mongodb-memory-server, не мок —
// мок пропускает ошибки самого запроса, CLAUDE.md «Тесты»): уникальные
// индексы держат идемпотентность (ADR-0004), связка encryptRecord/
// decryptRecord подтверждает, что coverage-тест не зелёный на молчаливо
// открытом тексте.
import { randomBytes } from 'crypto';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose, { type Connection, type Types } from 'mongoose';
import { MODEL_DEFINITIONS } from './model.registry';
import { CLASS_FIELD_POLICY } from '../classes/class.schema';
import { encryptSchemaFrom } from './field-policy';

interface DeliveryDoc {
  broadcastId: Types.ObjectId;
  channelId: Types.ObjectId;
}
interface LessonDoc {
  classId: Types.ObjectId;
  plannedAt?: Date;
  startsAt: Date;
  durationMin: number;
}
interface BroadcastDoc {
  kind: string;
  text: string;
  scheduledAt: Date;
  channelIds: Types.ObjectId[];
  lessonId?: Types.ObjectId;
}

type EncryptionModule = typeof import('../utils/encryption');

// loadKeys() в utils/encryption.ts читает process.env один раз при импорте
// модуля — статический import хойстился бы раньше выставления ключа, и
// encrypt() в non-production вернул бы открытый текст (см. utils/encryption.spec.ts).
function loadEncryption(): EncryptionModule {
  jest.resetModules();
  process.env.ENCRYPTION_KEY = randomBytes(32).toString('hex');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('../utils/encryption') as EncryptionModule;
}

describe('MODEL_DEFINITIONS против Mongo', () => {
  let mongod: MongoMemoryServer;
  let connection: Connection;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    connection = await mongoose.createConnection(mongod.getUri()).asPromise();
    for (const def of MODEL_DEFINITIONS) connection.model(def.name, def.schema);
    await Promise.all(
      Object.values(connection.models).map((model) => model.syncIndexes()),
    );
  }, 60_000);

  afterAll(async () => {
    await connection.close();
    await mongod.stop();
  });

  it('deliveries: второй insert с той же парой (broadcastId, channelId) падает', async () => {
    const Delivery = connection.model<DeliveryDoc>('DeliveryRecord');
    const broadcastId = new mongoose.Types.ObjectId();
    const channelId = new mongoose.Types.ObjectId();
    await Delivery.create({ broadcastId, channelId });
    await expect(Delivery.create({ broadcastId, channelId })).rejects.toMatchObject({
      code: 11000,
    });
  });

  it('lessons: второй insert с тем же (classId, plannedAt) падает', async () => {
    const Lesson = connection.model<LessonDoc>('LessonRecord');
    const classId = new mongoose.Types.ObjectId();
    const plannedAt = new Date('2026-09-08T16:00:00.000Z');
    await Lesson.create({ classId, plannedAt, startsAt: plannedAt, durationMin: 60 });
    await expect(
      Lesson.create({ classId, plannedAt, startsAt: plannedAt, durationMin: 60 }),
    ).rejects.toMatchObject({ code: 11000 });
  });

  it('lessons: без plannedAt один classId создаётся сколько угодно раз', async () => {
    const Lesson = connection.model<LessonDoc>('LessonRecord');
    const classId = new mongoose.Types.ObjectId();
    const startsAt = new Date('2026-09-09T16:00:00.000Z');
    await Lesson.create({ classId, startsAt, durationMin: 60 });
    await expect(
      Lesson.create({ classId, startsAt, durationMin: 60 }),
    ).resolves.toBeDefined();
  });

  it('broadcasts: второй lesson_link для занятия падает, recording — нет', async () => {
    const Broadcast = connection.model<BroadcastDoc>('BroadcastRecord');
    const lessonId = new mongoose.Types.ObjectId();
    const channelIds = [new mongoose.Types.ObjectId()];
    const base = { lessonId, channelIds, scheduledAt: new Date(), text: 'т' };
    await Broadcast.create({ ...base, kind: 'lesson_link' });
    await expect(
      Broadcast.create({ ...base, kind: 'lesson_link' }),
    ).rejects.toMatchObject({ code: 11000 });
    await expect(Broadcast.create({ ...base, kind: 'recording' })).resolves.toBeDefined();
  });

  it('encryptRecord/decryptRecord по CLASS_FIELD_POLICY: zoomLink шифруется и читается', () => {
    const { encryptRecord, decryptRecord } = loadEncryption();
    const schema = encryptSchemaFrom(CLASS_FIELD_POLICY);
    const record = { title: 'Тайцзицюань', zoomLink: 'https://zoom.example/1' };

    const saved = encryptRecord(record, schema);
    expect(saved.zoomLink).not.toBe(record.zoomLink);

    const loaded = decryptRecord(saved, schema);
    expect(loaded.zoomLink).toBe(record.zoomLink);
  });
});
