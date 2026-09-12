// Реестр моделей против настоящей Mongo (mongodb-memory-server, не мок —
// мок пропускает ошибки самого запроса, CLAUDE.md «Тесты»): уникальные
// индексы держат идемпотентность (ADR-0004), связка encryptRecord/
// decryptRecord подтверждает, что coverage-тест не зелёный на молчаливо
// открытом тексте.
import { randomBytes } from 'crypto';
import mongoose, { type Connection } from 'mongoose';
import { MODEL_DEFINITIONS } from './model.registry';
import { MONGO_DUPLICATE_KEY_CODE } from './mongo-error-codes';
import { CLASS_FIELD_POLICY } from '../classes/class.schema';
import { ChannelRecord } from '../channels/channel.schema';
import { DeliveryRecord } from '../deliveries/delivery.schema';
import { LessonRecord } from '../lessons/lesson.schema';
import { BroadcastRecord } from '../broadcasts/broadcast.schema';
import { ExamAttemptRecord } from '../exams/exam-attempt.schema';
import { BotSessionRecord } from '../telegram/bot-session.schema';
import { UserRecord } from '../users/user.schema';
import { encryptSchemaFrom } from './field-policy';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';

// Фиксированная дата, а не `new Date()`, — детерминизм теста (CLAUDE.md).
const FIXED_DATE = new Date('2026-09-08T16:00:00.000Z');

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
  let memory: MemoryMongo;
  let connection: Connection;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    for (const def of MODEL_DEFINITIONS) connection.model(def.name, def.schema);
    await Promise.all(
      Object.values(connection.models).map((model) => model.syncIndexes()),
    );
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  it('deliveries: второй insert с той же парой (broadcastId, channelId) падает', async () => {
    const Delivery = connection.model<DeliveryRecord>(DeliveryRecord.name);
    const broadcastId = new mongoose.Types.ObjectId();
    const channelId = new mongoose.Types.ObjectId();
    await Delivery.create({ broadcastId, channelId });
    await expect(Delivery.create({ broadcastId, channelId })).rejects.toMatchObject({
      code: MONGO_DUPLICATE_KEY_CODE,
    });
  });

  it('lessons: второй insert с тем же (classId, plannedAt) падает', async () => {
    const Lesson = connection.model<LessonRecord>(LessonRecord.name);
    const classId = new mongoose.Types.ObjectId();
    const plannedAt = FIXED_DATE;
    await Lesson.create({ classId, plannedAt, startsAt: plannedAt, durationMin: 60 });
    await expect(
      Lesson.create({ classId, plannedAt, startsAt: plannedAt, durationMin: 60 }),
    ).rejects.toMatchObject({ code: MONGO_DUPLICATE_KEY_CODE });
  });

  it('lessons: без plannedAt один classId создаётся сколько угодно раз', async () => {
    const Lesson = connection.model<LessonRecord>(LessonRecord.name);
    const classId = new mongoose.Types.ObjectId();
    const startsAt = FIXED_DATE;
    await Lesson.create({ classId, startsAt, durationMin: 60 });
    await expect(
      Lesson.create({ classId, startsAt, durationMin: 60 }),
    ).resolves.toBeDefined();
  });

  it('channels: второй telegram с тем же target падает, два manual с target "" создаются', async () => {
    const Channel = connection.model<ChannelRecord>(ChannelRecord.name);
    await Channel.create({
      type: 'telegram',
      title: 'A',
      config: 'x',
      target: '@school',
    });
    await expect(
      Channel.create({ type: 'telegram', title: 'B', config: 'y', target: '@school' }),
    ).rejects.toMatchObject({ code: MONGO_DUPLICATE_KEY_CODE });

    // Частичный индекс: target === '' у ручного канала не считается дублем —
    // иначе все manual-каналы конкурировали бы за один слот индекса.
    await Channel.create({ type: 'manual', title: 'Facebook', config: 'z', target: '' });
    await expect(
      Channel.create({ type: 'manual', title: 'Boosty', config: 'w', target: '' }),
    ).resolves.toBeDefined();
  });

  it('broadcasts: второй lesson_link для занятия падает, recording без recordingKey — нет', async () => {
    const Broadcast = connection.model<BroadcastRecord>(BroadcastRecord.name);
    const lessonId = new mongoose.Types.ObjectId();
    const channelIds = [new mongoose.Types.ObjectId()];
    const base = { lessonId, channelIds, scheduledAt: FIXED_DATE, text: 'т' };
    await Broadcast.create({ ...base, kind: 'lesson_link' });
    await expect(
      Broadcast.create({ ...base, kind: 'lesson_link' }),
    ).rejects.toMatchObject({ code: MONGO_DUPLICATE_KEY_CODE });
    // Без recordingKey частичный индекс (lessonId, recordingKey) не видит
    // документ ($type: 'string' отсеивает отсутствующее поле) — несколько
    // recording без ключа на одно занятие создаются свободно.
    await expect(Broadcast.create({ ...base, kind: 'recording' })).resolves.toBeDefined();
    await expect(Broadcast.create({ ...base, kind: 'recording' })).resolves.toBeDefined();
    // Ручная отправка ссылки без занятия — индекс частичный, ключ null не занят.
    const manual = {
      channelIds,
      scheduledAt: FIXED_DATE,
      text: 'т',
      kind: 'lesson_link',
    } as const;
    await Broadcast.create(manual);
    await expect(Broadcast.create(manual)).resolves.toBeDefined();
  });

  it('broadcasts: второй recording с тем же (lessonId, recordingKey) падает, другой url — нет', async () => {
    const Broadcast = connection.model<BroadcastRecord>(BroadcastRecord.name);
    const lessonId = new mongoose.Types.ObjectId();
    const channelIds = [new mongoose.Types.ObjectId()];
    const base = {
      kind: 'recording' as const,
      lessonId,
      channelIds,
      scheduledAt: FIXED_DATE,
      text: 'т',
    };
    await Broadcast.create({ ...base, recordingKey: 'https://drive.example/rec' });
    await expect(
      Broadcast.create({ ...base, recordingKey: 'https://drive.example/rec' }),
    ).rejects.toMatchObject({ code: MONGO_DUPLICATE_KEY_CODE });
    await expect(
      Broadcast.create({ ...base, recordingKey: 'https://drive.example/rec-2' }),
    ).resolves.toBeDefined();
    // Другое занятие с тем же url — не дубль, частичный индекс скопирован по lessonId.
    await expect(
      Broadcast.create({
        ...base,
        lessonId: new mongoose.Types.ObjectId(),
        recordingKey: 'https://drive.example/rec',
      }),
    ).resolves.toBeDefined();
  });

  it('users: два без telegramId создаются, два с одинаковым telegramId — конфликт', async () => {
    const User = connection.model<UserRecord>(UserRecord.name);
    await expect(
      User.create({ name: 'Без Telegram 1', roles: [] }),
    ).resolves.toBeDefined();
    await expect(
      User.create({ name: 'Без Telegram 2', roles: [] }),
    ).resolves.toBeDefined();

    await User.create({ name: 'Мария', telegramId: 42, roles: ['admin'] });
    await expect(
      User.create({ name: 'Двойник', telegramId: 42, roles: [] }),
    ).rejects.toMatchObject({ code: MONGO_DUPLICATE_KEY_CODE });
  });

  it('users: явный telegramId: null не занимает ключ частичного индекса (в отличие от sparse)', async () => {
    // Через драйвер напрямую, не через Model.create: telegramId: null — не
    // форма, которую допускает тип UserRecord (там telegramId — number |
    // undefined), но именно её мы проверяем на уровне индекса — партиция
    // фильтрует по $type: 'number', и BSON null под это не подходит.
    const users = connection.collection('users');
    await expect(
      users.insertOne({ name: 'Явный null 1', telegramId: null, roles: [] }),
    ).resolves.toBeDefined();
    await expect(
      users.insertOne({ name: 'Явный null 2', telegramId: null, roles: [] }),
    ).resolves.toBeDefined();
  });

  it('users: email и googleId — та же частичная уникальность', async () => {
    const User = connection.model<UserRecord>(UserRecord.name);
    await User.create({ name: 'Дима', email: 'dima@example.com', roles: ['teacher'] });
    await expect(
      User.create({ name: 'Двойник', email: 'dima@example.com', roles: [] }),
    ).rejects.toMatchObject({ code: MONGO_DUPLICATE_KEY_CODE });

    await User.create({ name: 'Гугл', googleId: 'g-1', roles: [] });
    await expect(
      User.create({ name: 'Гугл-двойник', googleId: 'g-1', roles: [] }),
    ).rejects.toMatchObject({ code: MONGO_DUPLICATE_KEY_CODE });
  });

  it('bot_sessions: второй insert с тем же chatId падает — один документ на чат', async () => {
    const BotSession = connection.model<BotSessionRecord>(BotSessionRecord.name);
    const lessonId = new mongoose.Types.ObjectId();
    await BotSession.create({
      chatId: 111,
      kind: 'topic',
      lessonId,
      expiresAt: FIXED_DATE,
    });
    await expect(
      BotSession.create({
        chatId: 111,
        kind: 'topic',
        lessonId: new mongoose.Types.ObjectId(),
        expiresAt: FIXED_DATE,
      }),
    ).rejects.toMatchObject({ code: MONGO_DUPLICATE_KEY_CODE });
  });

  it('exam_attempts: второй insert с той же тройкой (examId, userId, attemptNo) падает', async () => {
    const ExamAttempt = connection.model<ExamAttemptRecord>(ExamAttemptRecord.name);
    const examId = new mongoose.Types.ObjectId();
    const userId = new mongoose.Types.ObjectId();
    const base = {
      examId,
      examTitle: 'т',
      userId,
      attemptNo: 1,
      blocks: '[]',
      answers: '[]',
      startedAt: FIXED_DATE,
    };
    await ExamAttempt.create(base);
    await expect(ExamAttempt.create(base)).rejects.toMatchObject({
      code: MONGO_DUPLICATE_KEY_CODE,
    });
    // Вторая попытка того же ученика по той же форме — другой attemptNo, не дубль.
    await expect(ExamAttempt.create({ ...base, attemptNo: 2 })).resolves.toBeDefined();
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
