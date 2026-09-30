// Против настоящей Mongo (mongodb-memory-server — CLAUDE.md «Тесты»): фильтры
// по userId, distinct для каскада и проекция по include — то, что мок модели
// пропустил бы. Данные пишем тем же encryptRecord, что реальные сервисы, —
// иначе «расшифровано» ничего не доказывало бы (ENCRYPTION_KEY выставляет
// api/test/jest.setup.ts).
import { Logger } from '@nestjs/common';
import { Settings } from 'luxon';
import { Types } from 'mongoose';
import type { ExportRecord, UserDataExportDto } from '@xuanxue/shared';
import { EXAM_ATTEMPT_ENCRYPT_SCHEMA } from '../exams/exam-attempt.schema';
import { EXAM_GRADING_ENCRYPT_SCHEMA } from '../exams/exam-grading.schema';
import { MEDIA_ASSET_ENCRYPT_SCHEMA } from '../media/media-asset.schema';
import { PAYMENT_ENCRYPT_SCHEMA } from '../payments/payment.schema';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { encryptRecord } from '../utils/encryption';
import { USER_OWNED_CASCADES, USER_OWNED_COLLECTIONS } from './user-data.registry';
import { UserExportService } from './user-export.service';

const NOW_ISO = '2026-09-30T10:00:00.000Z';
const SECRET = 'СЕКРЕТ-НЕ-ДЛЯ-ВЫГРУЗКИ';

function oid(): Types.ObjectId {
  return new Types.ObjectId();
}

// telegramId и googleId уникальны в users (частичные индексы): второй человек
// в том же тесте не может повторить чужие.
let nextTelegramId = 4242;

describe('UserExportService', () => {
  let memory: MemoryMongo;
  let service: UserExportService;
  const model = (name: string) => memory.connection.model(name);

  beforeAll(async () => {
    memory = await openMemoryMongo();
    service = new UserExportService(memory.connection);
    Settings.now = () => Date.parse(NOW_ISO);
  }, 60_000);

  afterAll(async () => {
    Settings.now = () => Date.now();
    await memory.stop();
  });

  afterEach(async () => {
    await Promise.all(
      memory.connection.modelNames().map((name) => model(name).deleteMany({})),
    );
    jest.restoreAllMocks();
  });

  /** Человек с записями во всех коллекциях реестра; секреты помечены SECRET. */
  async function seedPerson(name: string, email: string) {
    const userId = oid();
    const attemptId = oid();
    const examId = oid();
    const graderId = oid();
    const imageId = oid();
    const telegramId = nextTelegramId++;
    await model('UserRecord').create({
      _id: userId,
      name,
      email,
      telegramId,
      googleId: `g-${telegramId}`,
      roles: [],
    });
    await model('ExamAttemptRecord').create({
      _id: attemptId,
      examId,
      userId,
      attemptNo: 1,
      status: 'graded',
      startedAt: new Date('2026-09-01T09:00:00Z'),
      imageIds: [oid()],
      ...encryptRecord(
        {
          examTitle: `Форма ${name}`,
          blocks: [
            {
              id: 'b1',
              title: 'Блок',
              questions: [
                {
                  itemId: 'q1',
                  version: 1,
                  kind: 'single',
                  prompt: 'Куда смотрит взгляд?',
                  options: [{ id: 'o1', text: 'Вперёд', correct: true }],
                },
              ],
            },
          ],
          answers: [{ itemId: 'q1', text: `Ответ ${name}` }],
        },
        EXAM_ATTEMPT_ENCRYPT_SCHEMA,
      ),
    });
    await model('ExamGradingRecord').create({
      attemptId,
      examId,
      userId,
      graderId,
      outcome: 'passed',
      gradedAt: new Date('2026-09-02T09:00:00Z'),
      ...encryptRecord({ comment: `Комментарий ${name}` }, EXAM_GRADING_ENCRYPT_SCHEMA),
    });
    await model('MediaAssetRecord').create({
      attemptId,
      userId,
      kind: 'telegram',
      receivedAt: new Date('2026-09-01T10:00:00Z'),
      durationSec: 30,
      ...encryptRecord(
        { fileId: SECRET, fileUniqueId: SECRET },
        MEDIA_ASSET_ENCRYPT_SCHEMA,
      ),
    });
    await model('PaymentScreenshotRecord').create({
      _id: imageId,
      bytes: Buffer.from(SECRET),
      contentType: 'image/png',
      sizeBytes: 2048,
    });
    await model('PaymentRecord').create({
      userId,
      month: '2026-09',
      status: 'paid',
      amountMinor: 25000,
      confirmedBy: graderId,
      confirmedAt: new Date('2026-09-05T09:00:00Z'),
      screenshotKind: 'upload',
      screenshotImageId: imageId,
      ...encryptRecord(
        { note: `Заметка ${name}`, screenshotFileId: SECRET },
        PAYMENT_ENCRYPT_SCHEMA,
      ),
    });
    await model('NotificationPrefsRecord').create({
      userId: userId.toString(),
      overrides: [{ kind: 'payment_due', enabled: false }],
    });
    await model('NotificationRecord').create({
      userId: userId.toString(),
      kind: 'exam_result',
      outcome: 'passed',
      examId: examId.toString(),
      attemptId: attemptId.toString(),
    });
    await model('PushSubscriptionRecord').create({
      userId: userId.toString(),
      endpoint: `https://push.example/${SECRET}/${userId.toString()}`,
      p256dh: SECRET,
      auth: SECRET,
    });
    await model('ExamSeenMarkRecord').create({
      userId: userId.toString(),
      examId: examId.toString(),
    });
    await model('AnswerVideoRecord').create({
      userId,
      attemptId,
      itemId: oid(),
      key: `answer-videos/${SECRET}`,
      sizeBytes: 5_000_000,
      fingerprint: SECRET,
      status: 'ready',
      completedAt: new Date('2026-09-01T11:00:00Z'),
    });
    await model('TelegramLinkCodeRecord').create({
      userId,
      codeHash: `${SECRET}-код-${telegramId}`,
      expiresAt: new Date('2026-09-30T11:00:00Z'),
    });
    await model('EmailLinkTokenRecord').create({
      userId,
      email,
      tokenHash: `${SECRET}-токен-${telegramId}`,
      expiresAt: new Date('2026-09-30T11:00:00Z'),
    });
    return {
      userId: userId.toString(),
      attemptId: attemptId.toString(),
      telegramId,
      graderId,
    };
  }

  const section = (dto: UserDataExportDto, key: string): ExportRecord[] => {
    const found = dto.sections.find((s) => s.key === key);
    if (!found) throw new Error(`нет секции ${key}`);
    return found.records;
  };

  it('отдаёт данные человека расшифрованными, со всеми моделями реестра', async () => {
    const anna = await seedPerson('Анна', 'anna@example.com');

    const dto = await service.exportUserData(anna.userId, 'admin-1');

    expect(dto.exportedAt).toBe(NOW_ISO);
    expect(dto.sections.map((s) => s.key)).toEqual([
      'UserRecord',
      ...USER_OWNED_COLLECTIONS,
      ...USER_OWNED_CASCADES.map((c) => c.model),
    ]);
    expect(section(dto, 'UserRecord')[0]).toMatchObject({
      id: anna.userId,
      name: 'Анна',
      email: 'anna@example.com',
      telegramId: anna.telegramId,
      googleId: `g-${anna.telegramId}`,
    });
    const [attempt] = section(dto, 'ExamAttemptRecord');
    expect(attempt).toMatchObject({
      examTitle: 'Форма Анна',
      answers: [{ itemId: 'q1', text: 'Ответ Анна' }],
      startedAt: '2026-09-01T09:00:00.000Z',
    });
    expect(section(dto, 'ExamGradingRecord')[0]).toMatchObject({
      comment: 'Комментарий Анна',
      outcome: 'passed',
      attemptId: anna.attemptId,
    });
    expect(section(dto, 'PaymentRecord')[0]).toMatchObject({
      month: '2026-09',
      amountMinor: 25000,
      note: 'Заметка Анна',
    });
    expect(section(dto, 'NotificationPrefsRecord')[0]).toMatchObject({
      overrides: [{ kind: 'payment_due', enabled: false }],
    });
  });

  it('свободный текст в базе лежит шифротекстом — тест выше не проверял бы расшифровку', async () => {
    await seedPerson('Анна', 'anna@example.com');

    const raw = await model('ExamGradingRecord').findOne().lean<{ comment: string }>();

    expect(raw?.comment).not.toContain('Комментарий');
  });

  it('файлы — метаданными: ни байтов скриншота, ни ключей Telegram и R2', async () => {
    const anna = await seedPerson('Анна', 'anna@example.com');

    const dto = await service.exportUserData(anna.userId, 'admin-1');

    expect(section(dto, 'PaymentScreenshotRecord')).toEqual([
      expect.objectContaining({ contentType: 'image/png', sizeBytes: 2048 }),
    ]);
    expect(section(dto, 'AnswerVideoRecord')[0]).toMatchObject({
      sizeBytes: 5_000_000,
      status: 'ready',
    });
    expect(section(dto, 'MediaAssetRecord')[0]).toMatchObject({
      kind: 'telegram',
      durationSec: 30,
    });
    expect(JSON.stringify(dto)).not.toContain(SECRET);
  });

  it('не отдаёт ключ верных ответов, id проверяющего и подтвердившего оплату', async () => {
    const anna = await seedPerson('Анна', 'anna@example.com');

    const json = JSON.stringify(await service.exportUserData(anna.userId, 'admin-1'));

    expect(json).toContain('Куда смотрит взгляд?');
    expect(json).not.toContain('correct');
    expect(json).not.toContain(anna.graderId.toString());
  });

  it('данные другого человека в выгрузку не попадают', async () => {
    const anna = await seedPerson('Анна', 'anna@example.com');
    await seedPerson('Борис', 'boris@example.com');

    const json = JSON.stringify(await service.exportUserData(anna.userId, 'admin-1'));

    expect(json).toContain('Анна');
    expect(json).not.toContain('Борис');
    expect(json).not.toContain('boris@example.com');
  });

  it('человек без данных — секции пусты, ссылок нет, ответ не падает', async () => {
    const userId = oid();
    await model('UserRecord').create({ _id: userId, name: 'Новичок', roles: [] });

    const dto = await service.exportUserData(userId.toString(), 'admin-1');

    expect(section(dto, 'UserRecord')).toHaveLength(1);
    const others = dto.sections.filter((s) => s.key !== 'UserRecord');
    expect(others.every((s) => s.records.length === 0)).toBe(true);
    expect(dto.references).toEqual([]);
  });

  it('ссылки на человека в данных школы — числом, без самих записей', async () => {
    const anna = await seedPerson('Анна', 'anna@example.com');
    await model('ClassRecord').create({
      title: 'Тайцзицюань для начинающих',
      format: 'online',
      leaderId: anna.userId,
    });
    await model('ExamGradingRecord').create({
      attemptId: oid(),
      examId: oid(),
      userId: oid(),
      graderId: anna.userId,
      outcome: 'failed',
      gradedAt: new Date('2026-09-03T09:00:00Z'),
    });

    const dto = await service.exportUserData(anna.userId, 'admin-1');

    expect(dto.references).toEqual([
      { title: 'Классы, где указан ведущим', count: 1 },
      { title: 'Работы других людей, которые проверил', count: 1 },
    ]);
    expect(JSON.stringify(dto)).not.toContain('Тайцзицюань для начинающих');
  });

  it('read-after-write: правка записи видна в следующей выгрузке', async () => {
    const anna = await seedPerson('Анна', 'anna@example.com');
    await service.exportUserData(anna.userId, 'admin-1');

    await model('UserRecord').updateOne(
      { _id: anna.userId },
      { $set: { email: 'novy@example.com' } },
    );

    const dto = await service.exportUserData(anna.userId, 'admin-1');
    expect(section(dto, 'UserRecord')[0]).toMatchObject({ email: 'novy@example.com' });
  });

  it('несуществующий и невалидный id — «Пользователь не найден»', async () => {
    await expect(service.exportUserData(oid().toString(), 'admin-1')).rejects.toThrow(
      'Пользователь не найден',
    );
    await expect(service.exportUserData('не-id', 'admin-1')).rejects.toThrow(
      'Пользователь не найден',
    );
  });

  it('в лог идут id и числа, без имени и почты', async () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const anna = await seedPerson('Анна', 'anna@example.com');

    await service.exportUserData(anna.userId, 'admin-1');

    const logged = JSON.stringify(log.mock.calls);
    expect(logged).toContain(anna.userId);
    expect(logged).toContain('"PaymentRecord":1');
    expect(logged).not.toContain('Анна');
    expect(logged).not.toContain('anna@example.com');
  });
});
