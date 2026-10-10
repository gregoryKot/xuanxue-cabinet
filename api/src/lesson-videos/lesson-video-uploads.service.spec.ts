// Загрузка записи занятия частями (ADR-0180, ADR-0165) на настоящей Mongo: старт и
// продолжение, потолок 2000 МБ, владение по createdBy, complete и его повтор. R2 —
// фейк-объекты с jest.fn(); механику частей и сборки держит свой spec ядра
// (video-uploads/video-uploads.service.spec.ts), здесь только то, что про школу.
import { DateTime } from 'luxon';
import { Types, type Connection, type Model } from 'mongoose';
import {
  FILE_STORAGE_OFF_MESSAGE,
  LESSON_VIDEO_LIMITS,
  LESSON_VIDEO_NOT_FOUND_MESSAGE,
  LESSON_VIDEO_TOO_LARGE_MESSAGE,
  VIDEO_POSTER_NOT_JPEG_MESSAGE,
  type VideoUploadDto,
} from '@xuanxue/shared';
import { InvalidInputError, NotAvailableError, NotFoundError } from '../common/errors';
import type { FileStoreService } from '../storage/file-store.service';
import type { MultipartStoreService } from '../storage/multipart-store.service';
import type { ObjectHeadService } from '../storage/object-head.service';
import {
  StorageOrphanRecord,
  StorageOrphanSchema,
} from '../storage/storage-orphan.schema';
import { StorageOrphansService } from '../storage/storage-orphans.service';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { readPoster } from '../video-uploads/video-poster';
import { VideoUploadsService } from '../video-uploads/video-uploads.service';
import { LessonVideoUploadsService } from './lesson-video-uploads.service';
import { LessonVideoRecord, LessonVideoSchema } from './lesson-video.schema';

const NOW = DateTime.utc(2026, 10, 10, 10, 0, 0);
const TEACHER = new Types.ObjectId().toString();
const OTHER_TEACHER = new Types.ObjectId().toString();
const SIZE_BYTES = 20;
// ISO-BMFF: сигнатура ftyp/isom — первая часть проходит sniffVideoSignature.
const MP4_PART = Buffer.concat([
  Buffer.from([0, 0, 0, 0x20]),
  Buffer.from('ftypisom', 'ascii'),
  Buffer.alloc(SIZE_BYTES - 12),
]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);

describe('LessonVideoUploadsService', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let model: Model<LessonVideoRecord>;
  let orphanModel: Model<StorageOrphanRecord>;
  let storageOn: boolean;
  let multipart: Record<string, jest.Mock>;
  let service: LessonVideoUploadsService;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    model = connection.model<LessonVideoRecord>(
      LessonVideoRecord.name,
      LessonVideoSchema,
    );
    orphanModel = connection.model<StorageOrphanRecord>(
      StorageOrphanRecord.name,
      StorageOrphanSchema,
    );
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  beforeEach(() => {
    storageOn = true;
    multipart = {
      createMultipartUpload: jest.fn().mockResolvedValue('upload-1'),
      uploadPart: jest.fn().mockResolvedValue('"etag-1"'),
      completeMultipartUpload: jest.fn().mockResolvedValue(undefined),
      abortMultipartUpload: jest.fn().mockResolvedValue(undefined),
    };
    const fileStore = {
      get isEnabled() {
        return storageOn;
      },
      remove: () => Promise.resolve(),
    } as unknown as FileStoreService;
    service = new LessonVideoUploadsService(
      model,
      fileStore,
      new VideoUploadsService(
        multipart as unknown as MultipartStoreService,
        {
          sizeBytes: jest.fn().mockResolvedValue(SIZE_BYTES),
        } as unknown as ObjectHeadService,
        new StorageOrphansService(orphanModel, fileStore),
      ),
    );
  });

  afterEach(async () => {
    await Promise.all([model.deleteMany({}), orphanModel.deleteMany({})]);
  });

  const start = (userId = TEACHER, fingerprint = 'f1', sizeBytes = SIZE_BYTES) =>
    service.start(userId, { sizeBytes, fingerprint }, NOW);

  async function uploaded(userId = TEACHER): Promise<VideoUploadDto> {
    const started = await start(userId);
    await service.uploadPart(started.id, userId, 1, MP4_PART, NOW);
    return started;
  }

  describe('start', () => {
    it('новая загрузка принадлежит учителю, ключ в каталоге записей занятий, ждёт части', async () => {
      const dto = await start();

      expect(dto).toMatchObject({ partCount: 1, receivedParts: [] });
      const doc = await model.findById(dto.id).lean();
      expect(doc?.createdBy?.toString()).toBe(TEACHER);
      expect(doc?.status).toBe('uploading');
      expect(doc?.key).toMatch(/^lesson-videos\/[0-9a-f-]{36}$/);
    });

    it('тот же файл тем же учителем — продолжение; у другого учителя — своя загрузка', async () => {
      const first = await uploaded();

      const again = await start();
      const other = await start(OTHER_TEACHER);

      expect(again).toMatchObject({ id: first.id, receivedParts: [1] });
      expect(other.id).not.toBe(first.id);
    });

    it('ровно 2000 МБ принимается, на байт больше — отказ с советом', async () => {
      const atLimit = await start(TEACHER, 'big', LESSON_VIDEO_LIMITS.maxBytes);

      expect(atLimit.partCount).toBe(250);
      await expect(
        start(TEACHER, 'bigger', LESSON_VIDEO_LIMITS.maxBytes + 1),
      ).rejects.toThrow(new InvalidInputError(LESSON_VIDEO_TOO_LARGE_MESSAGE));
    });

    it('R2 не подключён — NotAvailableError, записи нет', async () => {
      storageOn = false;

      await expect(start()).rejects.toThrow(
        new NotAvailableError(FILE_STORAGE_OFF_MESSAGE),
      );
      await expect(model.countDocuments({})).resolves.toBe(0);
    });
  });

  describe('владение загрузкой (SECURITY §3)', () => {
    it('чужая и несуществующая загрузка отвечают одинаково: 404', async () => {
      const mine = await start();
      const notFound = new NotFoundError(LESSON_VIDEO_NOT_FOUND_MESSAGE);

      await expect(
        service.uploadPart(mine.id, OTHER_TEACHER, 1, MP4_PART, NOW),
      ).rejects.toThrow(notFound);
      await expect(service.complete(mine.id, OTHER_TEACHER, NOW)).rejects.toThrow(
        notFound,
      );
      await expect(
        service.uploadPart(new Types.ObjectId().toString(), TEACHER, 1, MP4_PART, NOW),
      ).rejects.toThrow(notFound);
      await expect(service.complete('не-id', TEACHER, NOW)).rejects.toThrow(notFound);
    });
  });

  describe('complete', () => {
    it('собирает файл, видео готово, ответ без служебных полей', async () => {
      const upload = await uploaded();

      const dto = await service.complete(upload.id, TEACHER, NOW);

      expect(dto).toEqual({
        id: upload.id,
        contentType: 'video/mp4',
        sizeBytes: SIZE_BYTES,
        createdAt: expect.stringMatching(/Z$/) as string,
      });
      expect(multipart.completeMultipartUpload).toHaveBeenCalledTimes(1);
      const doc = await model.findById(upload.id).lean();
      expect(doc?.status).toBe('ready');
      expect(doc?.uploadId).toBeUndefined();
    });

    it('повтор complete — тот же ответ, в R2 вторая сборка не идёт', async () => {
      const upload = await uploaded();

      const first = await service.complete(upload.id, TEACHER, NOW);
      const again = await service.complete(upload.id, TEACHER, NOW);

      expect(again).toEqual(first);
      expect(multipart.completeMultipartUpload).toHaveBeenCalledTimes(1);
    });

    it('кадр-превью сохраняется; не-JPEG — 400 до сборки, видео остаётся незавершённым', async () => {
      const upload = await uploaded();

      await expect(
        service.complete(upload.id, TEACHER, NOW, Buffer.from('png').toString('base64')),
      ).rejects.toThrow(new InvalidInputError(VIDEO_POSTER_NOT_JPEG_MESSAGE));
      expect(multipart.completeMultipartUpload).not.toHaveBeenCalled();

      await service.complete(upload.id, TEACHER, NOW, JPEG.toString('base64'));
      const doc = await model.findById(upload.id, '+poster').lean();
      expect(readPoster(doc ?? {})?.equals(JPEG)).toBe(true);
    });
  });
});
