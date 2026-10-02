// Повтор `complete` доводит загрузку до конца (ADR-0165; аудит 2026-10-01,
// F47): после CompleteMultipartUpload в R2 сбой Mongo оставлял видео в
// `uploading`, а повтор получал от R2 NoSuchUpload и крутился в «Связь
// пропала» вечно — файл в R2 есть, `media_assets` нет. Против настоящей Mongo
// (CLAUDE.md «Тесты»); R2 — фейк-объекты с jest.fn(). Основной путь `complete`
// — answer-videos.flow.spec.ts, здесь только повторы и гонка.
import { DateTime } from 'luxon';
import type { Connection, Model } from 'mongoose';
import { Types } from 'mongoose';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { ConflictError, InvalidInputError, NotAvailableError } from '../common/errors';
import { VIDEO_POSTER_NOT_JPEG_MESSAGE } from '@xuanxue/shared';
import type { ExamAttemptRecord } from '../exams/exam-attempt.schema';
import { ExamAttemptSchema } from '../exams/exam-attempt.schema';
import { insertMediaAsset } from '../media/media-asset-insert';
import { ExamMediaNotifierRegistry } from '../media/exam-media-notifier.registry';
import { MediaAssetRecord, MediaAssetSchema } from '../media/media-asset.schema';
import type { FileStoreService } from '../storage/file-store.service';
import type { MultipartStoreService } from '../storage/multipart-store.service';
import type { ObjectHeadService } from '../storage/object-head.service';
import { MultipartUploadGoneError } from '../storage/r2-errors';
import {
  StorageOrphanRecord,
  StorageOrphanSchema,
} from '../storage/storage-orphan.schema';
import { StorageOrphansService } from '../storage/storage-orphans.service';
import { AnswerVideoCompleteService } from './answer-video-complete';
import { AnswerVideoPartService } from './answer-video-part';
import { readPoster } from '../video-uploads/video-poster';
import { VideoUploadsService } from '../video-uploads/video-uploads.service';
import { beforeModelCall } from '../test-support/before-model-call';
import { AnswerVideoRecord, AnswerVideoSchema } from './answer-video.schema';

const NOW = DateTime.utc(2026, 10, 2, 10, 0, 0);
const OWNER = new Types.ObjectId().toString();
const KEY = 'answer-videos/k1';
const SIZE_BYTES = 20;

describe('AnswerVideoCompleteService: повтор complete', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let videoModel: Model<AnswerVideoRecord>;
  let attemptModel: Model<ExamAttemptRecord>;
  let mediaModel: Model<MediaAssetRecord>;
  let orphanModel: Model<StorageOrphanRecord>;
  let multipart: {
    completeMultipartUpload: jest.Mock;
    createMultipartUpload: jest.Mock;
    uploadPart: jest.Mock;
  };
  let objectHead: { sizeBytes: jest.Mock };
  let notify: jest.Mock;
  let service: AnswerVideoCompleteService;
  let partService: AnswerVideoPartService;

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
    orphanModel = connection.model<StorageOrphanRecord>(
      StorageOrphanRecord.name,
      StorageOrphanSchema,
    );
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  beforeEach(() => {
    multipart = {
      completeMultipartUpload: jest.fn().mockResolvedValue(undefined),
      createMultipartUpload: jest.fn(),
      uploadPart: jest.fn(),
    };
    objectHead = { sizeBytes: jest.fn().mockResolvedValue(SIZE_BYTES) };
    notify = jest.fn().mockResolvedValue(undefined);
    const notifiers = new ExamMediaNotifierRegistry();
    notifiers.set({ notifyVideoLinkAdded: notify });
    const orphans = new StorageOrphansService(orphanModel, {
      remove: () => Promise.resolve(),
    } as unknown as FileStoreService);
    const uploads = new VideoUploadsService(
      multipart as unknown as MultipartStoreService,
      objectHead as unknown as ObjectHeadService,
      orphans,
    );
    service = new AnswerVideoCompleteService(
      videoModel,
      attemptModel,
      mediaModel,
      uploads,
      orphans,
      notifiers,
    );
    partService = new AnswerVideoPartService(videoModel, uploads);
  });

  afterEach(async () => {
    await Promise.all([
      videoModel.deleteMany({}),
      attemptModel.deleteMany({}),
      mediaModel.deleteMany({}),
      orphanModel.deleteMany({}),
    ]);
    jest.restoreAllMocks();
  });

  /** Загрузка, у которой дошли все части (одна) и которую пора завершать. */
  async function seedUpload(
    extra: Partial<AnswerVideoRecord> = {},
  ): Promise<{ id: string; attemptId: string; itemId: string }> {
    const attempt = await attemptModel.create({
      examId: new Types.ObjectId(),
      examTitle: 'Форма',
      userId: new Types.ObjectId(OWNER),
      attemptNo: 1,
      status: 'in_progress',
      blocks: '[]',
      answers: '[]',
      startedAt: NOW.toJSDate(),
    });
    const itemId = new Types.ObjectId();
    const video = await videoModel.create({
      userId: new Types.ObjectId(OWNER),
      attemptId: attempt._id,
      itemId,
      key: KEY,
      sizeBytes: SIZE_BYTES,
      fingerprint: `${SIZE_BYTES}:1`,
      uploadId: 'upload-1',
      parts: [{ n: 1, etag: '"e1"' }],
      ...extra,
    });
    await orphanModel.create({ key: KEY });
    return {
      id: video._id.toString(),
      attemptId: attempt._id.toString(),
      itemId: itemId.toString(),
    };
  }

  const mediaCount = (): Promise<number> => mediaModel.countDocuments({ kind: 'file' });

  it('сбой Mongo после сборки в R2 — повтор завершает загрузку: R2 второй раз не зовётся, запись одна, уведомление одно', async () => {
    const { id } = await seedUpload();
    jest.spyOn(mediaModel, 'create').mockRejectedValueOnce(new Error('mongo down'));

    await expect(service.complete(id, OWNER, NOW)).rejects.toThrow('mongo down');

    const stuck = await videoModel
      .findById(id)
      .lean<{ status: string; r2CompletedAt?: Date }>();
    expect(stuck?.status).toBe('uploading');
    expect(stuck?.r2CompletedAt).toBeInstanceOf(Date);
    // Файл в R2 уже никто не удалит через сутки: ключ вышел из журнала сирот.
    expect(await orphanModel.countDocuments({ key: KEY })).toBe(0);

    const media = await service.complete(id, OWNER, NOW);

    expect(multipart.completeMultipartUpload).toHaveBeenCalledTimes(1);
    expect(media.kind).toBe('file');
    expect(media.answerVideoId).toBe(id);
    expect(await mediaCount()).toBe(1);
    const done = await videoModel
      .findById(id)
      .lean<{ status: string; r2CompletedAt?: Date; uploadId?: string }>();
    expect(done).toMatchObject({ status: 'ready' });
    expect(done?.r2CompletedAt).toBeUndefined();
    expect(done?.uploadId).toBeUndefined();
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('запись о файле уже создана, а переход в ready не дошёл — повтор берёт её же, не заводит вторую', async () => {
    const { id, attemptId, itemId } = await seedUpload({ r2CompletedAt: NOW.toJSDate() });
    const first = await insertMediaAsset(mediaModel, {
      attemptId,
      userId: OWNER,
      itemId,
      kind: 'file',
      sizeBytes: SIZE_BYTES,
      answerVideoId: id,
      receivedAt: NOW.minus({ minutes: 5 }),
    });

    const media = await service.complete(id, OWNER, NOW);

    expect(media.id).toBe(first.id);
    expect(await mediaCount()).toBe(1);
    // Свой же файл повтор не убирает: он принят за «прежний» только у чужих.
    expect(await videoModel.countDocuments({ _id: id })).toBe(1);
    expect(multipart.completeMultipartUpload).not.toHaveBeenCalled();
    expect(await videoModel.findById(id).lean()).toMatchObject({ status: 'ready' });
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('гонка: запись о файле появилась между проверкой и вставкой — берём её, вторую не заводим', async () => {
    const { id, attemptId, itemId } = await seedUpload();
    const raced = await insertMediaAsset(mediaModel, {
      id,
      attemptId,
      userId: OWNER,
      itemId,
      kind: 'file',
      sizeBytes: SIZE_BYTES,
      answerVideoId: id,
      receivedAt: NOW,
    });
    // Первая проверка «записи ещё нет» — до того, как параллельный вызов её создал.
    jest
      .spyOn(mediaModel, 'findOne')
      .mockReturnValueOnce({ lean: () => Promise.resolve(null) } as never);

    const media = await service.complete(id, OWNER, NOW);

    expect(media.id).toBe(raced.id);
    expect(await mediaCount()).toBe(1);
  });

  it('дубль _id без записи о файле — ошибка уходит наружу, а не прячется', async () => {
    const { id, attemptId } = await seedUpload();
    await mediaModel.create({
      _id: new Types.ObjectId(id),
      attemptId: new Types.ObjectId(attemptId),
      userId: new Types.ObjectId(OWNER),
      kind: 'manual',
      receivedAt: NOW.toJSDate(),
    });

    await expect(service.complete(id, OWNER, NOW)).rejects.toMatchObject({ code: 11000 });
    expect(await videoModel.findById(id).lean()).toMatchObject({ status: 'uploading' });
  });

  it('метка не записалась: R2 отвечает NoSuchUpload, объект лежит с нужным размером — загрузка завершается', async () => {
    const { id } = await seedUpload();
    multipart.completeMultipartUpload.mockRejectedValue(
      new MultipartUploadGoneError('нет такой загрузки'),
    );

    const media = await service.complete(id, OWNER, NOW);

    expect(objectHead.sizeBytes).toHaveBeenCalledWith(KEY, NOW);
    expect(media.answerVideoId).toBe(id);
    expect(await mediaCount()).toBe(1);
    expect(await videoModel.findById(id).lean()).toMatchObject({ status: 'ready' });
  });

  it('NoSuchUpload и объекта нет — ошибка как раньше, ничего не записано', async () => {
    const { id } = await seedUpload();
    multipart.completeMultipartUpload.mockRejectedValue(
      new MultipartUploadGoneError('нет такой загрузки'),
    );
    objectHead.sizeBytes.mockResolvedValue(null);

    const failure = service.complete(id, OWNER, NOW);

    await expect(failure).rejects.toBeInstanceOf(MultipartUploadGoneError);
    await expect(failure).rejects.toBeInstanceOf(NotAvailableError);
    expect(await mediaCount()).toBe(0);
    const doc = await videoModel.findById(id).lean<{ r2CompletedAt?: Date }>();
    expect(doc).toMatchObject({ status: 'uploading' });
    expect(doc?.r2CompletedAt).toBeUndefined();
    expect(notify).not.toHaveBeenCalled();
  });

  it('NoSuchUpload и объект другого размера — тоже ошибка: чужие байты за свои не принимаем', async () => {
    const { id } = await seedUpload();
    multipart.completeMultipartUpload.mockRejectedValue(
      new MultipartUploadGoneError('нет такой загрузки'),
    );
    objectHead.sizeBytes.mockResolvedValue(SIZE_BYTES + 1);

    await expect(service.complete(id, OWNER, NOW)).rejects.toBeInstanceOf(
      MultipartUploadGoneError,
    );
    expect(await mediaCount()).toBe(0);
  });

  it('другой отказ R2 (не NoSuchUpload) — объект не проверяем, ошибка уходит как есть', async () => {
    const { id } = await seedUpload();
    multipart.completeMultipartUpload.mockRejectedValue(new NotAvailableError('сбой'));

    await expect(service.complete(id, OWNER, NOW)).rejects.toBeInstanceOf(
      NotAvailableError,
    );
    expect(objectHead.sizeBytes).not.toHaveBeenCalled();
  });

  it('уже завершённое видео — повтор отдаёт ту же запись, R2 и уведомление не трогает', async () => {
    const { id } = await seedUpload();
    const first = await service.complete(id, OWNER, NOW);
    multipart.completeMultipartUpload.mockClear();
    notify.mockClear();

    const again = await service.complete(id, OWNER, NOW.plus({ minutes: 1 }));

    expect(again).toEqual(first);
    expect(multipart.completeMultipartUpload).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
    expect(await mediaCount()).toBe(1);
  });

  it('завершённое видео чужому — NotFound, а не запись ученика', async () => {
    const { id } = await seedUpload();
    await service.complete(id, OWNER, NOW);

    await expect(
      service.complete(id, new Types.ObjectId().toString(), NOW),
    ).rejects.toMatchObject({ code: 'not_found' });
  });

  it('видео ready, а записи о нём уже нет — ConflictError: отдавать нечего', async () => {
    const { id } = await seedUpload({ status: 'ready' });

    await expect(service.complete(id, OWNER, NOW)).rejects.toBeInstanceOf(ConflictError);
  });

  it('два complete одновременно — одна запись, одно уведомление, оба получают её', async () => {
    const { id } = await seedUpload();
    // Как у настоящего R2: собирает один вызов, второй слышит NoSuchUpload.
    multipart.completeMultipartUpload
      .mockResolvedValueOnce(undefined)
      .mockRejectedValue(new MultipartUploadGoneError('нет такой загрузки'));

    const [a, b] = await Promise.all([
      service.complete(id, OWNER, NOW),
      service.complete(id, OWNER, NOW),
    ]);

    expect(a.id).toBe(b.id);
    expect(await mediaCount()).toBe(1);
    expect(await videoModel.findById(id).lean()).toMatchObject({ status: 'ready' });
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('после сборки в R2 часть 1 не принимается: вторая загрузка на тот же ключ осталась бы брошенной', async () => {
    const { id } = await seedUpload({ r2CompletedAt: NOW.toJSDate() });

    await expect(
      partService.uploadPart(id, OWNER, 1, Buffer.alloc(SIZE_BYTES), NOW),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(multipart.createMultipartUpload).not.toHaveBeenCalled();
    expect(multipart.uploadPart).not.toHaveBeenCalled();
  });

  // ADR-0165: кадр-превью приходит в теле complete и ложится в запись видео.
  describe('кадр-превью', () => {
    const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
    const OTHER_JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xdb, 9, 9]);

    async function storedPoster(id: string): Promise<Buffer | null> {
      const doc = await videoModel.findById(id, '+poster').lean();
      return doc && readPoster(doc);
    }

    it('с кадром: видео готово, кадр записан в ту же запись, ответ его не несёт', async () => {
      const { id } = await seedUpload();

      const media = await service.complete(id, OWNER, NOW, JPEG.toString('base64'));

      expect(await videoModel.findById(id).lean()).toMatchObject({ status: 'ready' });
      expect(await storedPoster(id)).toEqual(JPEG);
      expect(media).not.toHaveProperty('poster');
    });

    it('без кадра: видео готово, кадра нет', async () => {
      const { id } = await seedUpload();

      await service.complete(id, OWNER, NOW);

      expect(await videoModel.findById(id).lean()).toMatchObject({ status: 'ready' });
      expect(await storedPoster(id)).toBeNull();
    });

    it('неверный кадр: 400 до сборки в R2, видео не тронуто и завершается повтором без кадра', async () => {
      const { id } = await seedUpload();
      const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2]).toString('base64');

      const failure = service.complete(id, OWNER, NOW, png);

      await expect(failure).rejects.toBeInstanceOf(InvalidInputError);
      await expect(failure).rejects.toThrow(VIDEO_POSTER_NOT_JPEG_MESSAGE);
      expect(multipart.completeMultipartUpload).not.toHaveBeenCalled();
      expect(await videoModel.findById(id).lean()).toMatchObject({ status: 'uploading' });
      expect(await mediaCount()).toBe(0);

      await expect(service.complete(id, OWNER, NOW)).resolves.toMatchObject({
        kind: 'file',
      });
    });

    it('чужой с неверным кадром получает 404, а не разбор кадра', async () => {
      const { id } = await seedUpload();

      await expect(
        service.complete(id, new Types.ObjectId().toString(), NOW, 'не-кадр'),
      ).rejects.toMatchObject({ code: 'not_found' });
    });

    it('повтор complete с кадром у готового видео без кадра — кадр ставится один раз', async () => {
      const { id } = await seedUpload();
      await service.complete(id, OWNER, NOW);

      await service.complete(id, OWNER, NOW, JPEG.toString('base64'));
      await service.complete(id, OWNER, NOW, OTHER_JPEG.toString('base64'));

      expect(await storedPoster(id)).toEqual(JPEG);
      expect(await mediaCount()).toBe(1);
    });

    it('повтор без кадра у готового с кадром — кадр цел', async () => {
      const { id } = await seedUpload();
      await service.complete(id, OWNER, NOW, JPEG.toString('base64'));

      await service.complete(id, OWNER, NOW);

      expect(await storedPoster(id)).toEqual(JPEG);
    });

    it('неверный кадр на повторе у готового видео — тоже 400, кадр не меняется', async () => {
      const { id } = await seedUpload();
      await service.complete(id, OWNER, NOW);

      await expect(service.complete(id, OWNER, NOW, 'не-кадр')).rejects.toBeInstanceOf(
        InvalidInputError,
      );
      expect(await storedPoster(id)).toBeNull();
    });

    // Параллельный complete без кадра успевает целиком, пока наш ещё собирает:
    // наш переход в ready проигрывает, но кадр, который пришёл с ним, не теряется.
    it('проиграл переход в ready параллельному complete без кадра — кадр всё равно записан', async () => {
      const { id } = await seedUpload();
      beforeModelCall(videoModel, 'updateOne', async () => {
        await service.complete(id, OWNER, NOW.plus({ seconds: 1 }));
      });

      await service.complete(id, OWNER, NOW, JPEG.toString('base64'));

      expect(await storedPoster(id)).toEqual(JPEG);
      expect(await mediaCount()).toBe(1);
      expect(notify).toHaveBeenCalledTimes(1);
    });

    // Кадр лежит в самой записи, поэтому удаление записи — удаление кадра: ни
    // замена файла, ни уборка не знают о нём (read-after-write).
    it('замена файла к тому же вопросу убирает прежнее видео вместе с его кадром', async () => {
      const first = await seedUpload();
      await service.complete(first.id, OWNER, NOW, JPEG.toString('base64'));
      expect(await storedPoster(first.id)).toEqual(JPEG);
      const second = await videoModel.create({
        userId: new Types.ObjectId(OWNER),
        attemptId: new Types.ObjectId(first.attemptId),
        itemId: new Types.ObjectId(first.itemId),
        key: 'answer-videos/second',
        sizeBytes: SIZE_BYTES,
        fingerprint: 'second',
        uploadId: 'upload-2',
        parts: [{ n: 1, etag: '"e2"' }],
      });

      await service.complete(second._id.toString(), OWNER, NOW.plus({ minutes: 1 }));

      expect(
        await videoModel.collection.findOne({ _id: new Types.ObjectId(first.id) }),
      ).toBe(null);
      expect(await storedPoster(first.id)).toBeNull();
    });
  });
});
