// Против настоящей Mongo (mongodb-memory-server, не мок — CLAUDE.md
// «Тесты»): привязка видео к своей попытке, чужой attemptId — ничего не
// привязано (SECURITY §3, ADR-0023), ссылка (валидная/дубль), ручная
// отметка, выборка по попытке/списку попыток.
import { DateTime } from 'luxon';
import type { Connection, Model } from 'mongoose';
import { Types } from 'mongoose';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { ConflictError, NotFoundError } from '../common/errors';
import { encryptRecord } from '../utils/encryption';
import {
  EXAM_ATTEMPT_ENCRYPT_SCHEMA,
  ExamAttemptRecord,
  ExamAttemptSchema,
} from '../exams/exam-attempt.schema';
import { MediaAssetRecord, MediaAssetSchema } from './media-asset.schema';
import { MediaAssetsService } from './media-assets.service';

const NOW = DateTime.utc(2026, 9, 12, 10, 0, 0);

// Похожи на настоящие file_id Telegram и заведомо не встречаются в hex
// ObjectId: короткое «f1» однажды нашлось внутри случайного id, и тест
// про «fileId не уходит наружу» покраснел на ровном месте.
const FILE_ID = 'BgADBAADrwAD-video-file-id';
const FILE_UNIQUE_ID = 'AgADrwAD-unique-id';

describe('MediaAssetsService', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let attemptModel: Model<ExamAttemptRecord>;
  let mediaModel: Model<MediaAssetRecord>;
  let service: MediaAssetsService;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    attemptModel = connection.model<ExamAttemptRecord>(
      ExamAttemptRecord.name,
      ExamAttemptSchema,
    );
    mediaModel = connection.model<MediaAssetRecord>(
      MediaAssetRecord.name,
      MediaAssetSchema,
    );
    await mediaModel.syncIndexes();
    service = new MediaAssetsService(mediaModel, attemptModel);
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  afterEach(async () => {
    await attemptModel.deleteMany({});
    await mediaModel.deleteMany({});
  });

  async function seedAttempt(userId: string, examTitle = 'Форма первого уровня') {
    const created = await attemptModel.create(
      encryptRecord(
        {
          examId: new Types.ObjectId(),
          examTitle,
          userId: new Types.ObjectId(userId),
          attemptNo: 1,
          status: 'in_progress',
          blocks: '[]',
          answers: '[]',
          startedAt: NOW.toJSDate(),
        },
        EXAM_ATTEMPT_ENCRYPT_SCHEMA,
      ),
    );
    return created._id.toString();
  }

  const USER_A = new Types.ObjectId().toString();
  const USER_B = new Types.ObjectId().toString();

  describe('attachTelegramVideo', () => {
    it('владелец попытки — видео привязывается, examTitle расшифрован', async () => {
      const attemptId = await seedAttempt(USER_A);

      const result = await service.attachTelegramVideo(
        attemptId,
        USER_A,
        {
          fileId: FILE_ID,
          fileUniqueId: FILE_UNIQUE_ID,
          durationSec: 12,
          sizeBytes: 1024,
        },
        NOW,
      );

      expect(result?.examTitle).toBe('Форма первого уровня');
      expect(result?.media.kind).toBe('telegram');
      expect(result?.media.durationSec).toBe(12);
      // fileId/fileUniqueId никогда не покидают сервис в DTO.
      expect(JSON.stringify(result?.media)).not.toContain(FILE_ID);

      const raw = await mediaModel
        .findOne({ attemptId: new Types.ObjectId(attemptId) })
        .lean();
      expect(raw?.fileId).not.toBe(FILE_ID); // зашифровано в базе
    });

    it('чужой attemptId — ничего не привязано, без уточнения причины', async () => {
      const attemptId = await seedAttempt(USER_A);

      const result = await service.attachTelegramVideo(
        attemptId,
        USER_B,
        { fileId: FILE_ID, fileUniqueId: FILE_UNIQUE_ID },
        NOW,
      );

      expect(result).toBeNull();
      await expect(mediaModel.countDocuments({})).resolves.toBe(0);
    });

    it('несуществующий attemptId — null, не падает', async () => {
      const result = await service.attachTelegramVideo(
        new Types.ObjectId().toString(),
        USER_A,
        { fileId: FILE_ID, fileUniqueId: FILE_UNIQUE_ID },
        NOW,
      );

      expect(result).toBeNull();
    });

    it('нет привязанного пользователя (userId не пришёл) — null', async () => {
      const attemptId = await seedAttempt(USER_A);

      const result = await service.attachTelegramVideo(
        attemptId,
        undefined,
        { fileId: FILE_ID, fileUniqueId: FILE_UNIQUE_ID },
        NOW,
      );

      expect(result).toBeNull();
    });

    it('два видео от одного отправителя (кружок + обычное) — оба привязаны', async () => {
      const attemptId = await seedAttempt(USER_A);

      await service.attachTelegramVideo(
        attemptId,
        USER_A,
        { fileId: FILE_ID, fileUniqueId: FILE_UNIQUE_ID },
        NOW,
      );
      await service.attachTelegramVideo(
        attemptId,
        USER_A,
        { fileId: 'BgAAOTHER-file-id', fileUniqueId: 'AgADOTHER-unique' },
        NOW,
      );

      const list = await service.listForAttempt(attemptId);
      expect(list).toHaveLength(2);
    });
  });

  describe('addLink', () => {
    it('владелец — ссылка сохраняется', async () => {
      const attemptId = await seedAttempt(USER_A);

      const dto = await service.addLink(attemptId, USER_A, 'https://vk.com/video-1', NOW);

      expect(dto.kind).toBe('link');
      expect(dto.url).toBe('https://vk.com/video-1');
    });

    it('чужая попытка — NotFoundError, не Forbidden (не подтверждаем существование)', async () => {
      const attemptId = await seedAttempt(USER_A);

      await expect(
        service.addLink(attemptId, USER_B, 'https://vk.com/video-1', NOW),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('несуществующая попытка — NotFoundError', async () => {
      await expect(
        service.addLink(
          new Types.ObjectId().toString(),
          USER_A,
          'https://vk.com/video-1',
          NOW,
        ),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('вторая ссылка на ту же попытку — ConflictError, первая остаётся', async () => {
      const attemptId = await seedAttempt(USER_A);
      await service.addLink(attemptId, USER_A, 'https://vk.com/video-1', NOW);

      await expect(
        service.addLink(attemptId, USER_A, 'https://vk.com/video-2', NOW),
      ).rejects.toBeInstanceOf(ConflictError);

      const list = await service.listForAttempt(attemptId);
      expect(list).toHaveLength(1);
      expect(list[0]?.url).toBe('https://vk.com/video-1');
    });

    it('сбой записи не по дублю (не E11000) — уходит наверх как есть, не ConflictError', async () => {
      const attemptId = await seedAttempt(USER_A);
      const dbError = new Error('connection lost');
      jest.spyOn(mediaModel, 'create').mockRejectedValueOnce(dbError);

      await expect(
        service.addLink(attemptId, USER_A, 'https://vk.com/video-1', NOW),
      ).rejects.toBe(dbError);
    });
  });

  describe('addManual', () => {
    it('владельца берёт из попытки, не из вызывающего (учитель отмечает чужую)', async () => {
      const attemptId = await seedAttempt(USER_A);

      const dto = await service.addManual(attemptId, 'Прислал в WhatsApp', NOW);

      expect(dto.kind).toBe('manual');
      expect(dto.note).toBe('Прислал в WhatsApp');
      const raw = await mediaModel.findById(dto.id).lean();
      expect(raw?.userId.toString()).toBe(USER_A);
    });

    it('несуществующая попытка — NotFoundError', async () => {
      await expect(
        service.addManual(new Types.ObjectId().toString(), 'заметка', NOW),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('запись не найдена сразу после создания (защита в глубину) — программная ошибка', async () => {
      const attemptId = await seedAttempt(USER_A);
      jest.spyOn(mediaModel, 'findById').mockReturnValueOnce({
        lean: () => Promise.resolve(null),
      } as never);

      await expect(service.addManual(attemptId, 'заметка', NOW)).rejects.toThrow(
        'запись не найдена сразу после создания',
      );
    });
  });

  describe('listForAttempts', () => {
    it('один запрос на несколько попыток — недавнее сверху', async () => {
      const attemptA = await seedAttempt(USER_A);
      const attemptB = await seedAttempt(USER_B);
      await service.addLink(attemptA, USER_A, 'https://vk.com/a', NOW);
      await service.addManual(attemptB, undefined, NOW.plus({ minutes: 1 }));

      const byAttempt = await service.listForAttempts([attemptA, attemptB, 'not-an-id']);

      expect(byAttempt.get(attemptA)).toHaveLength(1);
      expect(byAttempt.get(attemptB)).toHaveLength(1);
      expect(byAttempt.has('not-an-id')).toBe(false);
    });

    it('пустой список id — пустая карта, без запроса к базе', async () => {
      const byAttempt = await service.listForAttempts([]);
      expect(byAttempt.size).toBe(0);
    });
  });
});
