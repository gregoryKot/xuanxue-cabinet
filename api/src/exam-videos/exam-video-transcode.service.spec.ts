// Против настоящей Mongo (mongodb-memory-server, не мок — CLAUDE.md «Тесты»): список
// видео для «Перегнать видео» и запись кодека, прочитанного браузером штата
// (ADR-0189). Сама подмена файла — exam-video-replace.spec.ts.
import { DateTime } from 'luxon';
import type { Connection, Model } from 'mongoose';
import { Types } from 'mongoose';
import {
  EXAM_VIDEO_NOT_FOUND_MESSAGE,
  VIDEOS_CODEC_PENDING_BATCH,
} from '@xuanxue/shared';
import type { VideoCodec } from '@xuanxue/shared';
import { NotFoundError } from '../common/errors';
import { ExamAttemptRecord, ExamAttemptSchema } from '../exams/exam-attempt.schema';
import { ExamItemRecord, ExamItemSchema } from '../exams/exam-item.schema';
import type { StorageOrphansService } from '../storage/storage-orphans.service';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { ExamVideoTranscodeService } from './exam-video-transcode.service';
import { ExamVideoRecord, ExamVideoSchema } from './exam-video.schema';

const NOW = DateTime.utc(2026, 10, 29, 12, 0, 0);

describe('ExamVideoTranscodeService', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let videoModel: Model<ExamVideoRecord>;
  let service: ExamVideoTranscodeService;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    videoModel = connection.model<ExamVideoRecord>(ExamVideoRecord.name, ExamVideoSchema);
    service = new ExamVideoTranscodeService(
      videoModel,
      connection.model<ExamItemRecord>(ExamItemRecord.name, ExamItemSchema),
      connection.model<ExamAttemptRecord>(ExamAttemptRecord.name, ExamAttemptSchema),
      {} as StorageOrphansService,
    );
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  afterEach(async () => {
    await videoModel.deleteMany({});
  });

  /** Готовое видео; `ageMinutes` — как давно создано (старые первыми в списке). */
  async function seed(
    options: {
      codec?: VideoCodec;
      status?: 'ready' | 'uploading';
      ageMinutes?: number;
    } = {},
  ): Promise<string> {
    const key = `exam-videos/${new Types.ObjectId().toString()}`;
    const doc = await videoModel.create({
      key,
      contentType: 'video/mp4',
      sizeBytes: 100,
      fingerprint: key,
      status: options.status ?? 'ready',
      ...(options.codec ? { videoCodec: options.codec } : {}),
    });
    await videoModel.collection.updateOne(
      { _id: doc._id },
      { $set: { createdAt: NOW.minus({ minutes: options.ageMinutes ?? 0 }).toJSDate() } },
    );
    return doc._id.toString();
  }
  const pendingIds = async (): Promise<string[]> =>
    (await service.listPending()).map((video) => video.id);

  describe('listPending', () => {
    it('пустая база — пустой список', async () => {
      await expect(service.listPending()).resolves.toEqual([]);
    });

    it('HEVC и видео без кодека — в списке, avc и недогруженное — нет', async () => {
      const hevc = await seed({ codec: 'hevc' });
      const unknown = await seed();
      await seed({ codec: 'avc' });
      await seed({ status: 'uploading' });

      expect((await pendingIds()).sort()).toEqual([hevc, unknown].sort());
    });

    it('видео без поля status (до ADR-0165) считается готовым и попадает в список', async () => {
      const legacy = await videoModel.collection.insertOne({
        key: 'exam-videos/legacy',
        contentType: 'video/mp4',
        sizeBytes: 5,
        createdAt: NOW.toJSDate(),
        updatedAt: NOW.toJSDate(),
      });

      await expect(pendingIds()).resolves.toEqual([legacy.insertedId.toString()]);
    });

    it('старые первыми, DTO без ключа объекта', async () => {
      const newest = await seed({ ageMinutes: 1 });
      const oldest = await seed({ ageMinutes: 30 });
      const middle = await seed({ ageMinutes: 10 });

      const list = await service.listPending();

      expect(list.map((video) => video.id)).toEqual([oldest, middle, newest]);
      expect(list[0]).toEqual({
        id: oldest,
        contentType: 'video/mp4',
        sizeBytes: 100,
        createdAt: NOW.minus({ minutes: 30 }).toISO(),
      });
      expect(JSON.stringify(list)).not.toContain('exam-videos/');
    });

    it('не больше VIDEOS_CODEC_PENDING_BATCH за раз, следующая пачка — после обработки первой', async () => {
      const total = VIDEOS_CODEC_PENDING_BATCH + 3;
      for (let i = 0; i < total; i += 1) await seed({ ageMinutes: total - i });

      const first = await service.listPending();
      expect(first).toHaveLength(VIDEOS_CODEC_PENDING_BATCH);
      for (const video of first) await service.setCodec(video.id, 'avc');

      await expect(service.listPending()).resolves.toHaveLength(3);
    });
  });

  // Порядок шагов и все отказы подмены — exam-video-replace.spec.ts; здесь только то,
  // что сервис подключает её к своим моделям и отдаёт DTO цели.
  describe('replace', () => {
    it('подменяет файл за прежним id и записывает исходный ключ', async () => {
      const targetId = await seed({ codec: 'hevc', ageMinutes: 600 });
      const replacementId = await seed({ codec: 'avc', ageMinutes: 5 });
      const before = await videoModel.findById(targetId).lean();
      const replacementKey = (await videoModel.findById(replacementId).lean())?.key;

      const dto = await service.replace(targetId, replacementId, NOW);

      expect(dto.id).toBe(targetId);
      expect(await videoModel.findById(targetId).lean()).toMatchObject({
        key: replacementKey,
        originalKey: before?.key,
        videoCodec: 'avc',
      });
      expect(await pendingIds()).not.toContain(targetId);
    });
  });

  describe('setCodec', () => {
    it('сохранил → нашёл: avc выводит видео из списка', async () => {
      const id = await seed();
      expect(await pendingIds()).toEqual([id]);

      const dto = await service.setCodec(id, 'avc');

      expect(dto.id).toBe(id);
      expect(await pendingIds()).toEqual([]);
      expect(await videoModel.findById(id).lean()).toMatchObject({ videoCodec: 'avc' });
    });

    it('hevc остаётся в списке, но кодек записан; чтение браузера — истина и перетирает прежнее значение', async () => {
      const id = await seed({ codec: 'avc' });
      expect(await pendingIds()).toEqual([]);

      await service.setCodec(id, 'hevc');

      expect(await pendingIds()).toEqual([id]);
      expect(await videoModel.findById(id).lean()).toMatchObject({ videoCodec: 'hevc' });
    });

    it('чужие поля не трогает: ключ, размер, исходник', async () => {
      const id = await seed();
      const before = await videoModel.findById(id).lean();

      await service.setCodec(id, 'avc');

      const after = await videoModel.findById(id).lean();
      expect(after).toMatchObject({ key: before?.key, sizeBytes: before?.sizeBytes });
      expect(after).not.toHaveProperty('originalKey');
    });

    it('нет такого, кривой id, ещё грузится — 404 с текстом «не найдено»', async () => {
      const uploading = await seed({ status: 'uploading' });

      for (const id of [new Types.ObjectId().toString(), 'не-id', uploading]) {
        const failure = service.setCodec(id, 'avc');
        await expect(failure).rejects.toBeInstanceOf(NotFoundError);
        await expect(failure).rejects.toMatchObject({
          message: EXAM_VIDEO_NOT_FOUND_MESSAGE,
        });
      }
      expect(await videoModel.findById(uploading).lean()).not.toHaveProperty(
        'videoCodec',
      );
    });
  });
});
