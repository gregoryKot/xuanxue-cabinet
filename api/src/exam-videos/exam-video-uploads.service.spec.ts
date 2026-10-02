// Загрузка видео вопроса частями (ADR-0165) на настоящей Mongo: старт и продолжение,
// параллельные клипы одного учителя, владение по createdBy, complete и его повтор.
// R2 — фейк-объекты с jest.fn(); механику частей и сборки держит свой spec ядра
// (video-uploads/video-uploads.service.spec.ts), здесь только то, что про школу.
import { DateTime } from 'luxon';
import type { Connection, Model } from 'mongoose';
import { Types } from 'mongoose';
import {
  EXAM_VIDEO_LIMITS,
  type StartExamVideoInput,
  type VideoUploadDto,
} from '@xuanxue/shared';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import {
  ConflictError,
  InvalidInputError,
  NotAvailableError,
  NotFoundError,
} from '../common/errors';
import type { FileStoreService } from '../storage/file-store.service';
import type { MultipartStoreService } from '../storage/multipart-store.service';
import type { ObjectHeadService } from '../storage/object-head.service';
import { MultipartUploadGoneError } from '../storage/r2-errors';
import {
  StorageOrphanRecord,
  StorageOrphanSchema,
} from '../storage/storage-orphan.schema';
import { StorageOrphansService } from '../storage/storage-orphans.service';
import { VideoUploadsService } from '../video-uploads/video-uploads.service';
import { ExamVideoUploadsService } from './exam-video-uploads.service';
import { ExamVideoRecord, ExamVideoSchema } from './exam-video.schema';

const NOW = DateTime.utc(2026, 10, 2, 10, 0, 0);
const TEACHER = new Types.ObjectId().toString();
const OTHER_TEACHER = new Types.ObjectId().toString();
const SIZE_BYTES = 20;
// ISO-BMFF: сигнатура ftyp/isom — sniffVideoSignature пропускает первую часть.
const MP4_PART = Buffer.concat([
  Buffer.from([0, 0, 0, 0x20]),
  Buffer.from('ftypisom', 'ascii'),
  Buffer.alloc(SIZE_BYTES - 12),
]);

describe('ExamVideoUploadsService', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let model: Model<ExamVideoRecord>;
  let orphanModel: Model<StorageOrphanRecord>;
  let multipart: {
    createMultipartUpload: jest.Mock;
    uploadPart: jest.Mock;
    completeMultipartUpload: jest.Mock;
    abortMultipartUpload: jest.Mock;
  };
  let objectHead: { sizeBytes: jest.Mock };
  let fileStoreEnabled: { value: boolean };
  let service: ExamVideoUploadsService;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    model = connection.model<ExamVideoRecord>(ExamVideoRecord.name, ExamVideoSchema);
    orphanModel = connection.model<StorageOrphanRecord>(
      StorageOrphanRecord.name,
      StorageOrphanSchema,
    );
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  beforeEach(() => {
    fileStoreEnabled = { value: true };
    multipart = {
      createMultipartUpload: jest.fn().mockResolvedValue('upload-1'),
      uploadPart: jest.fn().mockResolvedValue('"etag-1"'),
      completeMultipartUpload: jest.fn().mockResolvedValue(undefined),
      abortMultipartUpload: jest.fn().mockResolvedValue(undefined),
    };
    objectHead = { sizeBytes: jest.fn().mockResolvedValue(SIZE_BYTES) };
    const fileStore = {
      get isEnabled() {
        return fileStoreEnabled.value;
      },
      remove: () => Promise.resolve(),
    } as unknown as FileStoreService;
    const orphans = new StorageOrphansService(orphanModel, fileStore);
    service = new ExamVideoUploadsService(
      model,
      fileStore,
      new VideoUploadsService(
        multipart as unknown as MultipartStoreService,
        objectHead as unknown as ObjectHeadService,
        orphans,
      ),
    );
  });

  afterEach(async () => {
    await Promise.all([model.deleteMany({}), orphanModel.deleteMany({})]);
    jest.restoreAllMocks();
  });

  const input = (fingerprint = 'f1', sizeBytes = SIZE_BYTES): StartExamVideoInput => ({
    sizeBytes,
    fingerprint,
  });

  /** Загрузка со всеми частями (одна), готовая к complete. */
  async function uploaded(userId = TEACHER, fingerprint = 'f1'): Promise<VideoUploadDto> {
    const started = await service.start(userId, input(fingerprint), NOW);
    await service.uploadPart(started.id, userId, 1, MP4_PART, NOW);
    return started;
  }

  describe('start', () => {
    it('новая загрузка: запись принадлежит учителю, ключ в каталоге видео вопросов, ждёт части', async () => {
      const dto = await service.start(TEACHER, input(), NOW);

      expect(dto).toMatchObject({ partCount: 1, receivedParts: [] });
      const doc = await model.findById(dto.id).lean();
      expect(doc?.createdBy?.toString()).toBe(TEACHER);
      expect(doc?.status).toBe('uploading');
      expect(doc?.key).toMatch(/^exam-videos\/[0-9a-f-]{36}$/);
      expect(await orphanModel.countDocuments({ key: doc?.key })).toBe(1);
    });

    it('тот же файл тем же учителем — продолжение: тот же id, вторая запись не заводится', async () => {
      const first = await uploaded();
      const again = await service.start(TEACHER, input(), NOW);

      expect(again.id).toBe(first.id);
      expect(again.receivedParts).toEqual([1]);
      expect(await model.countDocuments({})).toBe(1);
    });

    it('другой файл того же учителя — своя загрузка, параллельная прежняя не убирается', async () => {
      const first = await service.start(TEACHER, input('f1'), NOW);
      await model.updateOne({ _id: first.id }, { $set: { uploadId: 'upload-first' } });

      const second = await service.start(TEACHER, input('f2'), NOW);

      expect(second.id).not.toBe(first.id);
      expect(await model.countDocuments({ status: 'uploading' })).toBe(2);
      expect(multipart.abortMultipartUpload).not.toHaveBeenCalled();
    });

    it('тот же файл у другого учителя — отдельная загрузка, чужую не продолжаем', async () => {
      const mine = await service.start(TEACHER, input(), NOW);
      const theirs = await service.start(OTHER_TEACHER, input(), NOW);

      expect(theirs.id).not.toBe(mine.id);
    });

    it('готовое видео с тем же отпечатком не «продолжается» — идёт новая загрузка', async () => {
      const first = await uploaded();
      await service.complete(first.id, TEACHER, NOW);

      const again = await service.start(TEACHER, input(), NOW);

      expect(again.id).not.toBe(first.id);
      expect(again.receivedParts).toEqual([]);
    });

    it('хранилище выключено — NotAvailableError, запись не создаётся', async () => {
      fileStoreEnabled.value = false;

      await expect(service.start(TEACHER, input(), NOW)).rejects.toBeInstanceOf(
        NotAvailableError,
      );
      expect(await model.countDocuments({})).toBe(0);
    });

    it('больше потолка в 50 МБ — InvalidInputError, бот не отправит такое в Telegram', async () => {
      await expect(
        service.start(TEACHER, input('f', EXAM_VIDEO_LIMITS.maxBytes + 1), NOW),
      ).rejects.toBeInstanceOf(InvalidInputError);
    });
  });

  describe('uploadPart', () => {
    it('часть владельца принимается, тип определяется по сигнатуре и пишется в запись', async () => {
      const started = await service.start(TEACHER, input(), NOW);

      const dto = await service.uploadPart(started.id, TEACHER, 1, MP4_PART, NOW);

      expect(dto.receivedParts).toEqual([1]);
      expect((await model.findById(started.id).lean())?.contentType).toBe('video/mp4');
    });

    it('чужая загрузка (другой учитель) и несуществующая — одинаковый NotFoundError', async () => {
      const started = await service.start(TEACHER, input(), NOW);

      await expect(
        service.uploadPart(started.id, OTHER_TEACHER, 1, MP4_PART, NOW),
      ).rejects.toBeInstanceOf(NotFoundError);
      await expect(
        service.uploadPart(new Types.ObjectId().toString(), TEACHER, 1, MP4_PART, NOW),
      ).rejects.toBeInstanceOf(NotFoundError);
      expect(multipart.uploadPart).not.toHaveBeenCalled();
    });

    it('запись без createdBy (сид, CLI) не принадлежит никому — NotFoundError', async () => {
      const seeded = await model.create({
        key: 'exam-videos/seeded',
        sizeBytes: SIZE_BYTES,
        fingerprint: 'f',
      });

      await expect(
        service.uploadPart(seeded._id.toString(), TEACHER, 1, MP4_PART, NOW),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('не-id в пути — NotFoundError, а не ошибка приведения', async () => {
      await expect(
        service.uploadPart('не-id', TEACHER, 1, MP4_PART, NOW),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe('complete', () => {
    it('все части на месте — видео готово: тип, размер, части и служебные поля убраны', async () => {
      const started = await uploaded();

      const dto = await service.complete(started.id, TEACHER, NOW);

      expect(dto).toMatchObject({
        id: started.id,
        contentType: 'video/mp4',
        sizeBytes: SIZE_BYTES,
      });
      expect(dto).not.toHaveProperty('key');
      const doc = await model.findById(started.id).lean();
      expect(doc).toMatchObject({ status: 'ready', parts: [] });
      expect(doc?.completedAt).toBeInstanceOf(Date);
      expect(doc?.uploadId).toBeUndefined();
      expect(doc?.r2CompletedAt).toBeUndefined();
      expect(await orphanModel.countDocuments({})).toBe(0);
    });

    it('не все части — ConflictError, R2 не трогается', async () => {
      const started = await service.start(TEACHER, input(), NOW);
      await model.updateOne({ _id: started.id }, { $set: { uploadId: 'upload-1' } });

      await expect(service.complete(started.id, TEACHER, NOW)).rejects.toBeInstanceOf(
        ConflictError,
      );
      expect(multipart.completeMultipartUpload).not.toHaveBeenCalled();
    });

    it('загрузка не начиналась (нет первой части) — ConflictError', async () => {
      const started = await service.start(TEACHER, input(), NOW);

      await expect(service.complete(started.id, TEACHER, NOW)).rejects.toBeInstanceOf(
        ConflictError,
      );
    });

    it('чужая загрузка — NotFoundError, и готовое видео другому учителю не отдаётся', async () => {
      const started = await uploaded();

      await expect(
        service.complete(started.id, OTHER_TEACHER, NOW),
      ).rejects.toBeInstanceOf(NotFoundError);
      await service.complete(started.id, TEACHER, NOW);
      await expect(
        service.complete(started.id, OTHER_TEACHER, NOW),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    // F47 (аудит 2026-10-01) и его повтор у видео вопроса: ответ первого вызова
    // потерялся — второй не падает и не собирает файл заново.
    it('повтор на готовом видео — тот же ответ, R2 второй раз не зовётся', async () => {
      const started = await uploaded();
      const first = await service.complete(started.id, TEACHER, NOW);
      multipart.completeMultipartUpload.mockClear();

      const again = await service.complete(started.id, TEACHER, NOW.plus({ minutes: 1 }));

      expect(again).toEqual(first);
      expect(multipart.completeMultipartUpload).not.toHaveBeenCalled();
    });

    it('сбой Mongo после сборки в R2 (метка стоит) — повтор доводит до готового без второго вызова R2', async () => {
      const started = await uploaded();
      await model.updateOne(
        { _id: started.id },
        { $set: { r2CompletedAt: NOW.toJSDate() } },
      );

      const dto = await service.complete(started.id, TEACHER, NOW);

      expect(dto.id).toBe(started.id);
      expect(multipart.completeMultipartUpload).not.toHaveBeenCalled();
      expect(await model.findById(started.id).lean()).toMatchObject({ status: 'ready' });
    });

    it('метка не записалась: R2 отвечает NoSuchUpload, объект лежит с нужным размером — готово', async () => {
      const started = await uploaded();
      multipart.completeMultipartUpload.mockRejectedValue(
        new MultipartUploadGoneError('нет такой загрузки'),
      );

      const dto = await service.complete(started.id, TEACHER, NOW);

      expect(dto.id).toBe(started.id);
      expect(await model.findById(started.id).lean()).toMatchObject({ status: 'ready' });
    });

    it('два complete одновременно — одно видео, оба получают один и тот же ответ', async () => {
      const started = await uploaded();
      multipart.completeMultipartUpload
        .mockResolvedValueOnce(undefined)
        .mockRejectedValue(new MultipartUploadGoneError('нет такой загрузки'));

      const [a, b] = await Promise.all([
        service.complete(started.id, TEACHER, NOW),
        service.complete(started.id, TEACHER, NOW),
      ]);

      expect(a).toEqual(b);
      expect(await model.countDocuments({ status: 'ready' })).toBe(1);
    });
  });
});
