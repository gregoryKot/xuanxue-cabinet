// Против настоящей Mongo (mongodb-memory-server, не мок — CLAUDE.md
// «Тесты»): владение, вопрос-снимок, статус попытки, размер/сигнатура части,
// гонка первой части, замена файла на complete — весь путь, что не покрыт
// answer-videos.e2e-spec.ts (там — HTTP-контур и happy path целиком).
// MultipartStoreService — фейк-объект с jest.fn(), R2 из юнита не трогаем.
import { DateTime } from 'luxon';
import type { Connection, Model } from 'mongoose';
import { Types } from 'mongoose';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import {
  ConflictError,
  InvalidInputError,
  NotAvailableError,
  NotFoundError,
} from '../common/errors';
import type { AttemptBlockRecord, ExamAttemptRecord } from '../exams/exam-attempt.schema';
import { ExamAttemptSchema } from '../exams/exam-attempt.schema';
import { insertMediaAsset } from '../media/media-asset-insert';
import { MediaAssetRecord, MediaAssetSchema } from '../media/media-asset.schema';
import { ExamMediaNotifierRegistry } from '../media/exam-media-notifier.registry';
import type { FileStoreService } from '../storage/file-store.service';
import type { MultipartStoreService } from '../storage/multipart-store.service';
import type { ObjectHeadService } from '../storage/object-head.service';
import {
  StorageOrphanRecord,
  StorageOrphanSchema,
} from '../storage/storage-orphan.schema';
import { StorageOrphansService } from '../storage/storage-orphans.service';
import { AnswerVideoAssembleService } from './answer-video-assemble';
import { AnswerVideoCompleteService } from './answer-video-complete';
import { AnswerVideoPartService } from './answer-video-part';
import { AnswerVideoStartService } from './answer-video-start';
import { AnswerVideoRecord, AnswerVideoSchema } from './answer-video.schema';

const NOW = DateTime.utc(2026, 9, 27, 10, 0, 0);
const VIDEO_ITEM_ID = new Types.ObjectId().toString();
const TEXT_ITEM_ID = new Types.ObjectId().toString();
const BLOCKS: AttemptBlockRecord[] = [
  {
    id: 'b1',
    title: 'Блок',
    questions: [
      {
        itemId: VIDEO_ITEM_ID,
        version: 1,
        kind: 'video',
        prompt: 'Снимите форму',
        options: [],
      },
      {
        itemId: TEXT_ITEM_ID,
        version: 1,
        kind: 'text',
        prompt: 'Опишите форму',
        options: [],
      },
    ],
  },
];

// Валидная сигнатура MP4 (ftyp/isom) — sniffVideoSignature должен принять.
// Ровно `size` байт всегда — sniffIsoBmff читает смещения 4..11, поэтому
// `size` в тестах ниже не меньше 12.
function mp4Bytes(size: number): Buffer {
  const head = Buffer.concat([
    Buffer.from([0, 0, 0, 0x20]),
    Buffer.from('ftyp', 'ascii'),
    Buffer.from('isom', 'ascii'),
  ]);
  return Buffer.concat([head, Buffer.alloc(Math.max(size - head.length, 0))]).subarray(
    0,
    size,
  );
}

describe('AnswerVideo start/part/complete (юнит на настоящей Mongo)', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let videoModel: Model<AnswerVideoRecord>;
  let attemptModel: Model<ExamAttemptRecord>;
  let mediaModel: Model<MediaAssetRecord>;
  let orphans: StorageOrphansService;
  let multipart: {
    isEnabled: boolean;
    createMultipartUpload: jest.Mock;
    uploadPart: jest.Mock;
    completeMultipartUpload: jest.Mock;
    abortMultipartUpload: jest.Mock;
  };
  let fileStoreEnabled: { value: boolean };
  let startService: AnswerVideoStartService;
  let partService: AnswerVideoPartService;
  let completeService: AnswerVideoCompleteService;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    videoModel = connection.model<AnswerVideoRecord>(
      AnswerVideoRecord.name,
      AnswerVideoSchema,
    );
    attemptModel = connection.model<ExamAttemptRecord>(
      'ExamAttemptRecord',
      ExamAttemptSchema,
    );
    mediaModel = connection.model<MediaAssetRecord>(
      MediaAssetRecord.name,
      MediaAssetSchema,
    );
    const orphanModel = connection.model<StorageOrphanRecord>(
      StorageOrphanRecord.name,
      StorageOrphanSchema,
    );
    fileStoreEnabled = { value: true };
    const fileStore = {
      get isEnabled() {
        return fileStoreEnabled.value;
      },
      remove: () => Promise.resolve(),
    } as unknown as FileStoreService;
    orphans = new StorageOrphansService(orphanModel, fileStore);

    multipart = {
      isEnabled: true,
      createMultipartUpload: jest.fn().mockResolvedValue('upload-1'),
      uploadPart: jest.fn().mockResolvedValue('"etag-1"'),
      completeMultipartUpload: jest.fn().mockResolvedValue(undefined),
      abortMultipartUpload: jest.fn().mockResolvedValue(undefined),
    };

    startService = new AnswerVideoStartService(
      videoModel,
      attemptModel,
      {
        get isEnabled() {
          return fileStoreEnabled.value;
        },
      } as unknown as FileStoreService,
      multipart as unknown as MultipartStoreService,
      orphans,
    );
    partService = new AnswerVideoPartService(
      videoModel,
      multipart as unknown as MultipartStoreService,
    );
    completeService = new AnswerVideoCompleteService(
      videoModel,
      attemptModel,
      mediaModel,
      new AnswerVideoAssembleService(
        videoModel,
        multipart as unknown as MultipartStoreService,
        {} as ObjectHeadService,
        orphans,
      ),
      orphans,
      new ExamMediaNotifierRegistry(),
    );
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  afterEach(async () => {
    await Promise.all([
      videoModel.deleteMany({}),
      attemptModel.deleteMany({}),
      mediaModel.deleteMany({}),
    ]);
    jest.clearAllMocks();
    // restoreAllMocks — сеть безопасности для jest.spyOn(videoModel, …) в
    // отдельных тестах ниже: не задевает multipart (обычные jest.fn(), не
    // spyOn) и их mockResolvedValue из beforeAll.
    jest.restoreAllMocks();
    fileStoreEnabled.value = true;
    multipart.isEnabled = true;
  });

  async function seedAttempt(
    userId: string,
    status: 'in_progress' | 'submitted' | 'graded' = 'in_progress',
  ) {
    const doc = await attemptModel.create({
      examId: new Types.ObjectId(),
      examTitle: 'Форма',
      userId: new Types.ObjectId(userId),
      attemptNo: 1,
      status,
      blocks: JSON.stringify(BLOCKS),
      answers: '[]',
      startedAt: NOW.toJSDate(),
    });
    return doc._id.toString();
  }

  const USER_A = new Types.ObjectId().toString();
  const USER_B = new Types.ObjectId().toString();

  describe('start', () => {
    it('чужой attemptId — NotFoundError', async () => {
      const attemptId = await seedAttempt(USER_A);
      await expect(
        startService.start(
          attemptId,
          USER_B,
          { itemId: VIDEO_ITEM_ID, sizeBytes: 10, fingerprint: 'x' },
          NOW,
        ),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('itemId не video-вопрос снимка — NotFoundError', async () => {
      const attemptId = await seedAttempt(USER_A);
      await expect(
        startService.start(
          attemptId,
          USER_A,
          { itemId: TEXT_ITEM_ID, sizeBytes: 10, fingerprint: 'x' },
          NOW,
        ),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('попытка graded — ConflictError', async () => {
      const attemptId = await seedAttempt(USER_A, 'graded');
      await expect(
        startService.start(
          attemptId,
          USER_A,
          { itemId: VIDEO_ITEM_ID, sizeBytes: 10, fingerprint: 'x' },
          NOW,
        ),
      ).rejects.toBeInstanceOf(ConflictError);
    });

    it('хранилище выключено — NotAvailableError', async () => {
      fileStoreEnabled.value = false;
      const attemptId = await seedAttempt(USER_A);
      await expect(
        startService.start(
          attemptId,
          USER_A,
          { itemId: VIDEO_ITEM_ID, sizeBytes: 10, fingerprint: 'x' },
          NOW,
        ),
      ).rejects.toBeInstanceOf(NotAvailableError);
    });

    it('sizeBytes больше потолка — InvalidInputError', async () => {
      const attemptId = await seedAttempt(USER_A);
      await expect(
        startService.start(
          attemptId,
          USER_A,
          { itemId: VIDEO_ITEM_ID, sizeBytes: 1024 ** 3 + 1, fingerprint: 'x' },
          NOW,
        ),
      ).rejects.toBeInstanceOf(InvalidInputError);
    });

    it('тот же файл (размер+отпечаток) — resume, тот же id', async () => {
      const attemptId = await seedAttempt(USER_A);
      const input = { itemId: VIDEO_ITEM_ID, sizeBytes: 5000, fingerprint: '5000:1' };
      const first = await startService.start(attemptId, USER_A, input, NOW);
      const second = await startService.start(attemptId, USER_A, input, NOW);
      expect(second.id).toBe(first.id);
      expect(await videoModel.countDocuments({})).toBe(1);
    });

    it('другой файл к тому же вопросу — прежняя загрузка убирается (multipart прерван, если открыт)', async () => {
      const attemptId = await seedAttempt(USER_A);
      const first = await startService.start(
        attemptId,
        USER_A,
        { itemId: VIDEO_ITEM_ID, sizeBytes: 5000, fingerprint: '5000:1' },
        NOW,
      );
      await videoModel.updateOne(
        { _id: first.id },
        { $set: { uploadId: 'stale-upload' } },
      );

      const second = await startService.start(
        attemptId,
        USER_A,
        { itemId: VIDEO_ITEM_ID, sizeBytes: 6000, fingerprint: '6000:1' },
        NOW,
      );

      expect(second.id).not.toBe(first.id);
      expect(multipart.abortMultipartUpload).toHaveBeenCalledWith(
        expect.any(String),
        'stale-upload',
        NOW,
      );
      expect(await videoModel.countDocuments({})).toBe(1);
    });

    it('отмена прежней multipart-загрузки не удалась — best-effort, новая загрузка всё равно начинается', async () => {
      const attemptId = await seedAttempt(USER_A);
      const first = await startService.start(
        attemptId,
        USER_A,
        { itemId: VIDEO_ITEM_ID, sizeBytes: 5000, fingerprint: '5000:1' },
        NOW,
      );
      await videoModel.updateOne(
        { _id: first.id },
        { $set: { uploadId: 'stale-upload' } },
      );
      multipart.abortMultipartUpload.mockRejectedValueOnce(new Error('R2 недоступен'));

      const second = await startService.start(
        attemptId,
        USER_A,
        { itemId: VIDEO_ITEM_ID, sizeBytes: 6000, fingerprint: '6000:1' },
        NOW,
      );

      expect(second.id).not.toBe(first.id);
      expect(await videoModel.countDocuments({})).toBe(1);
    });

    it('запись не найдена сразу после создания — Error (защита в глубину)', async () => {
      const attemptId = await seedAttempt(USER_A);
      const spy = jest
        .spyOn(videoModel, 'findById')
        .mockReturnValueOnce({ lean: () => Promise.resolve(null) } as never);

      await expect(
        startService.start(
          attemptId,
          USER_A,
          { itemId: VIDEO_ITEM_ID, sizeBytes: 10, fingerprint: 'x' },
          NOW,
        ),
      ).rejects.toThrow('запись не найдена сразу после создания');
      spy.mockRestore();
    });
  });

  describe('uploadPart', () => {
    async function startUpload(sizeBytes: number, userId = USER_A) {
      const attemptId = await seedAttempt(userId);
      const upload = await startService.start(
        attemptId,
        userId,
        { itemId: VIDEO_ITEM_ID, sizeBytes, fingerprint: `${sizeBytes}:1` },
        NOW,
      );
      return { attemptId, upload };
    }

    it('чужой userId — NotFoundError', async () => {
      const { upload } = await startUpload(5000);
      await expect(
        partService.uploadPart(upload.id, USER_B, 1, mp4Bytes(5000), NOW),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('номер части вне диапазона — InvalidInputError', async () => {
      const { upload } = await startUpload(5000);
      await expect(
        partService.uploadPart(upload.id, USER_A, 2, mp4Bytes(5000), NOW),
      ).rejects.toBeInstanceOf(InvalidInputError);
    });

    it('размер части не совпал — InvalidInputError', async () => {
      const { upload } = await startUpload(5000);
      await expect(
        partService.uploadPart(upload.id, USER_A, 1, mp4Bytes(4000), NOW),
      ).rejects.toBeInstanceOf(InvalidInputError);
    });

    it('первая часть без валидной сигнатуры — InvalidInputError (EXAM_VIDEO_UNSUPPORTED)', async () => {
      const { upload } = await startUpload(10);
      await expect(
        partService.uploadPart(upload.id, USER_A, 1, Buffer.alloc(10, 9), NOW),
      ).rejects.toBeInstanceOf(InvalidInputError);
    });

    it('часть 2 раньше части 1 — ConflictError (первая часть обязательна)', async () => {
      const { upload } = await startUpload(ANSWER_VIDEO_TWO_PART_TOTAL);
      await expect(
        partService.uploadPart(upload.id, USER_A, 2, Buffer.alloc(1000), NOW),
      ).rejects.toBeInstanceOf(ConflictError);
    });

    it('первая часть валидна — открывает multipart, возвращает receivedParts [1]', async () => {
      const { upload } = await startUpload(20);
      const result = await partService.uploadPart(
        upload.id,
        USER_A,
        1,
        mp4Bytes(20),
        NOW,
      );
      expect(result.receivedParts).toEqual([1]);
      expect(multipart.createMultipartUpload).toHaveBeenCalledTimes(1);
    });

    it('повтор той же части — обновляет ETag, не плодит вторую запись', async () => {
      const { upload } = await startUpload(20);
      await partService.uploadPart(upload.id, USER_A, 1, mp4Bytes(20), NOW);
      const again = await partService.uploadPart(upload.id, USER_A, 1, mp4Bytes(20), NOW);
      expect(again.receivedParts).toEqual([1]);
    });

    it('уже завершено (status: ready) — ConflictError', async () => {
      const { upload } = await startUpload(20);
      await partService.uploadPart(upload.id, USER_A, 1, mp4Bytes(20), NOW);
      await videoModel.updateOne({ _id: upload.id }, { $set: { status: 'ready' } });

      await expect(
        partService.uploadPart(upload.id, USER_A, 1, mp4Bytes(20), NOW),
      ).rejects.toBeInstanceOf(ConflictError);
    });

    it('тело не Buffer — InvalidInputError (EXAM_VIDEO_EMPTY_MESSAGE)', async () => {
      const { upload } = await startUpload(20);
      await expect(
        partService.uploadPart(upload.id, USER_A, 1, 'не буфер', NOW),
      ).rejects.toBeInstanceOf(InvalidInputError);
    });

    it('проиграл гонку открытия multipart — прерывает свой, берёт uploadId победителя', async () => {
      const { upload } = await startUpload(20);
      // Побеждающий запрос ставит uploadId в БД ровно в момент, когда наш
      // createMultipartUpload возвращается — реальный условный findOneAndUpdate
      // (`uploadId: { $exists: false }`) естественно не находит документ и
      // возвращает null, ветка гонки срабатывает без подмены самого запроса.
      multipart.createMultipartUpload.mockImplementationOnce(async () => {
        await videoModel.updateOne(
          { _id: upload.id },
          { $set: { uploadId: 'upload-winner' } },
        );
        return 'upload-loser';
      });

      const result = await partService.uploadPart(
        upload.id,
        USER_A,
        1,
        mp4Bytes(20),
        NOW,
      );

      expect(multipart.abortMultipartUpload).toHaveBeenCalledWith(
        expect.any(String),
        'upload-loser',
        NOW,
      );
      expect(result.receivedParts).toEqual([1]);
    });

    it('запись пропала между записью части и повторным чтением — Error (защита в глубину)', async () => {
      const { upload } = await startUpload(20);
      // Первый findById (в начале метода) считает исходный документ, второй
      // (после записи части) подменяем на null — программно невозможный
      // случай, тот же приём, что у media-assets.service.spec.ts «запись не
      // найдена сразу после создания».
      let calls = 0;
      const originalFindById = videoModel.findById.bind(videoModel);
      const spy = jest
        .spyOn(videoModel, 'findById')
        .mockImplementation((...args: Parameters<typeof originalFindById>) => {
          calls += 1;
          if (calls === 1) return originalFindById(...args);
          return { lean: () => Promise.resolve(null) } as never;
        });

      await expect(
        partService.uploadPart(upload.id, USER_A, 1, mp4Bytes(20), NOW),
      ).rejects.toThrow('запись пропала во время загрузки');
      spy.mockRestore();
    });
  });

  describe('complete', () => {
    async function readyForComplete(
      sizeBytes = 20,
    ): Promise<{ id: string; attemptId: string }> {
      const { attemptId, upload } = await (async () => {
        const attemptId = await seedAttempt(USER_A);
        const upload = await startService.start(
          attemptId,
          USER_A,
          { itemId: VIDEO_ITEM_ID, sizeBytes, fingerprint: `${sizeBytes}:1` },
          NOW,
        );
        return { attemptId, upload };
      })();
      await partService.uploadPart(upload.id, USER_A, 1, mp4Bytes(sizeBytes), NOW);
      return { id: upload.id, attemptId };
    }

    it('не все части пришли — ConflictError', async () => {
      const attemptId = await seedAttempt(USER_A);
      const upload = await startService.start(
        attemptId,
        USER_A,
        {
          itemId: VIDEO_ITEM_ID,
          sizeBytes: ANSWER_VIDEO_TWO_PART_TOTAL,
          fingerprint: 'x',
        },
        NOW,
      );
      await partService.uploadPart(upload.id, USER_A, 1, mp4Bytes(8 * 1024 * 1024), NOW);
      await expect(
        completeService.complete(upload.id, USER_A, NOW),
      ).rejects.toBeInstanceOf(ConflictError);
    });

    it('чужой userId — NotFoundError', async () => {
      const { id } = await readyForComplete();
      await expect(completeService.complete(id, USER_B, NOW)).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });

    it('успех — media_assets kind file, answer_video становится ready', async () => {
      const { id, attemptId } = await readyForComplete();
      const media = await completeService.complete(id, USER_A, NOW);

      expect(media.kind).toBe('file');
      expect(media.attemptId).toBe(attemptId);
      expect(media.answerVideoId).toBe(id);
      const doc = await videoModel
        .findById(id)
        .lean<{ status: string; parts: unknown[] }>();
      expect(doc?.status).toBe('ready');
      expect(doc?.parts).toEqual([]);
      expect(multipart.completeMultipartUpload).toHaveBeenCalledTimes(1);
    });

    it('второй файл к тому же вопросу заменяет прежний (ADR-0086/ADR-0137)', async () => {
      const { id: firstId, attemptId } = await readyForComplete();
      const firstMedia = await completeService.complete(firstId, USER_A, NOW);

      const secondUpload = await startService.start(
        attemptId,
        USER_A,
        { itemId: VIDEO_ITEM_ID, sizeBytes: 20, fingerprint: '20:1' },
        NOW,
      );
      await partService.uploadPart(secondUpload.id, USER_A, 1, mp4Bytes(20), NOW);
      const secondMedia = await completeService.complete(secondUpload.id, USER_A, NOW);

      expect(
        await mediaModel.countDocuments({
          attemptId,
          itemId: VIDEO_ITEM_ID,
          kind: 'file',
        }),
      ).toBe(1);
      expect(secondMedia.id).not.toBe(firstMedia.id);
      // Прежний answer_videos документ убран целиком, не просто «не ready».
      expect(await videoModel.countDocuments({ _id: firstId })).toBe(0);
    });

    it('уже есть посторонний media_assets той же (attemptId, itemId) без answerVideoId — не падает', async () => {
      const { id, attemptId } = await readyForComplete();
      await insertMediaAsset(mediaModel, {
        attemptId,
        userId: USER_A,
        itemId: VIDEO_ITEM_ID,
        kind: 'manual',
        note: 'штат отметил вручную',
        receivedAt: NOW,
      });

      await expect(completeService.complete(id, USER_A, NOW)).resolves.toMatchObject({
        kind: 'file',
      });
    });

    it('попытка исчезла между загрузкой и complete — NotFoundError', async () => {
      const { id, attemptId } = await readyForComplete();
      await attemptModel.deleteOne({ _id: attemptId });

      await expect(completeService.complete(id, USER_A, NOW)).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });

    it('попытку проверили между загрузкой и complete — ConflictError', async () => {
      const { id, attemptId } = await readyForComplete();
      await attemptModel.updateOne({ _id: attemptId }, { $set: { status: 'graded' } });

      await expect(completeService.complete(id, USER_A, NOW)).rejects.toBeInstanceOf(
        ConflictError,
      );
    });

    it('несколько частей — CompleteMultipartUpload получает их по возрастанию номера', async () => {
      const attemptId = await seedAttempt(USER_A);
      const upload = await startService.start(
        attemptId,
        USER_A,
        {
          itemId: VIDEO_ITEM_ID,
          sizeBytes: ANSWER_VIDEO_TWO_PART_TOTAL,
          fingerprint: 'x',
        },
        NOW,
      );
      await partService.uploadPart(upload.id, USER_A, 1, mp4Bytes(8 * 1024 * 1024), NOW);
      await partService.uploadPart(upload.id, USER_A, 2, Buffer.alloc(1000), NOW);
      multipart.completeMultipartUpload.mockClear();

      await completeService.complete(upload.id, USER_A, NOW);

      const calls = multipart.completeMultipartUpload.mock.calls as [
        { parts: { partNumber: number }[] },
      ][];
      const call = calls[0]?.[0];
      expect(call?.parts.map((p) => p.partNumber)).toEqual([1, 2]);
    });
  });
});

// Часть 8 МиБ ровно не хватает для partCount=2 с крошечным хвостом — берём
// чуть больше границы, тем же приёмом, что в e2e (ANSWER_VIDEO_LIMITS.partBytes).
const ANSWER_VIDEO_TWO_PART_TOTAL = 8 * 1024 * 1024 + 1000;
