// Против настоящей Mongo (mongodb-memory-server, не мок — CLAUDE.md «Тесты»): подмена
// файла видео перегнанным в H.264 (ADR-0189). Главное, что держат тесты: исходный
// файл не удаляется и не попадает в журнал сирот ни при каком исходе, а падение между
// шагами не оставляет цель с ключом удалённого объекта (порядок шагов — в
// exam-video-replace.ts). Хранилище — фейк: объекты в Map, удаления записываются.
import { DateTime } from 'luxon';
import type { Connection, Model } from 'mongoose';
import { Types } from 'mongoose';
import {
  EXAM_VIDEO_NOT_FOUND_MESSAGE,
  EXAM_VIDEO_UPLOADING_MESSAGE,
  H264_VIDEO_CODEC,
} from '@xuanxue/shared';
import { ConflictError, InvalidInputError, NotFoundError } from '../common/errors';
import { ExamAttemptRecord, ExamAttemptSchema } from '../exams/exam-attempt.schema';
import { ExamItemRecord, ExamItemSchema } from '../exams/exam-item.schema';
import type { FileStoreService } from '../storage/file-store.service';
import {
  StorageOrphanRecord,
  StorageOrphanSchema,
} from '../storage/storage-orphan.schema';
import { StorageOrphansService } from '../storage/storage-orphans.service';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { binaryToBuffer } from '../common/binary-to-buffer';
import {
  EXAM_VIDEO_ALREADY_REPLACED_MESSAGE,
  EXAM_VIDEO_REPLACE_LOST_MESSAGE,
  EXAM_VIDEO_REPLACE_NOT_H264_MESSAGE,
  EXAM_VIDEO_REPLACE_SELF_MESSAGE,
  EXAM_VIDEO_REPLACE_STALE_MESSAGE,
  EXAM_VIDEO_REPLACE_USED_MESSAGE,
} from './exam-video-replace.messages';
import { REPLACEMENT_MAX_AGE_HOURS, type ReplaceDeps } from './exam-video-replace-checks';
import { replaceExamVideo } from './exam-video-replace';
import { ExamVideoRecord, ExamVideoSchema } from './exam-video.schema';

const NOW = DateTime.utc(2026, 10, 29, 12, 0, 0);
const OLD_KEY = 'exam-videos/old-hevc';
const NEW_KEY = 'exam-videos/new-h264';
const JPEG_OLD = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 1]);
const JPEG_NEW = Buffer.from([0xff, 0xd8, 0xff, 0xdb, 2, 2]);

interface SeedOptions {
  key: string;
  contentType?: 'video/mp4' | 'video/quicktime' | 'video/webm';
  sizeBytes?: number;
  codec?: 'avc' | 'hevc';
  poster?: Buffer;
  telegramFileId?: string;
  ageHours?: number;
  status?: 'ready' | 'uploading';
}

describe('replaceExamVideo (ADR-0189)', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let videoModel: Model<ExamVideoRecord>;
  let itemModel: Model<ExamItemRecord>;
  let attemptModel: Model<ExamAttemptRecord>;
  let orphanModel: Model<StorageOrphanRecord>;
  let deps: ReplaceDeps;
  /** Что реально удалили из хранилища, по порядку. */
  let removed: string[];
  let failRemove: boolean;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    videoModel = connection.model<ExamVideoRecord>(ExamVideoRecord.name, ExamVideoSchema);
    itemModel = connection.model<ExamItemRecord>(ExamItemRecord.name, ExamItemSchema);
    attemptModel = connection.model<ExamAttemptRecord>(
      ExamAttemptRecord.name,
      ExamAttemptSchema,
    );
    orphanModel = connection.model<StorageOrphanRecord>(
      StorageOrphanRecord.name,
      StorageOrphanSchema,
    );
    const fileStore = {
      isEnabled: true,
      remove: (key: string) => {
        if (failRemove) return Promise.reject(new Error('R2 недоступен'));
        removed.push(key);
        return Promise.resolve();
      },
    } as unknown as FileStoreService;
    deps = {
      model: videoModel,
      itemModel,
      attemptModel,
      orphans: new StorageOrphansService(orphanModel, fileStore),
    };
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  beforeEach(() => {
    removed = [];
    failRemove = false;
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await Promise.all([
      videoModel.deleteMany({}),
      itemModel.deleteMany({}),
      attemptModel.deleteMany({}),
      orphanModel.deleteMany({}),
    ]);
  });

  async function seed(options: SeedOptions): Promise<string> {
    const doc = await videoModel.create({
      key: options.key,
      contentType: options.contentType ?? 'video/mp4',
      sizeBytes: options.sizeBytes ?? 1_000,
      fingerprint: `fp:${options.key}`,
      status: options.status ?? 'ready',
      ...(options.codec ? { videoCodec: options.codec } : {}),
      ...(options.poster ? { poster: options.poster } : {}),
    });
    const patch: Record<string, unknown> = {
      createdAt: NOW.minus({ hours: options.ageHours ?? 1 }).toJSDate(),
    };
    if (options.telegramFileId) patch.telegramFileId = options.telegramFileId;
    await videoModel.collection.updateOne({ _id: doc._id }, { $set: patch });
    return doc._id.toString();
  }

  const readTarget = (id: string) =>
    videoModel.findOne({ _id: id }).select('+poster').lean();
  const replace = (targetId: string, replacementId: string, now = NOW) =>
    replaceExamVideo(deps, { targetId, replacementId, now });
  const journalKeys = async (): Promise<string[]> =>
    (await orphanModel.find({}, { key: 1 }).lean()).map((doc) => doc.key);

  describe('успех', () => {
    it('цель получает файл замены, прежний файл уходит в original*, документ замены удалён', async () => {
      const targetId = await seed({
        key: OLD_KEY,
        contentType: 'video/quicktime',
        sizeBytes: 9_000,
      });
      const replacementId = await seed({
        key: NEW_KEY,
        sizeBytes: 3_000,
        codec: 'avc',
      });

      const dto = await replace(targetId, replacementId);

      expect(dto).toMatchObject({
        id: targetId,
        contentType: 'video/mp4',
        sizeBytes: 3_000,
      });
      const doc = await readTarget(targetId);
      expect(doc).toMatchObject({
        key: NEW_KEY,
        contentType: 'video/mp4',
        sizeBytes: 3_000,
        fingerprint: `fp:${NEW_KEY}`,
        videoCodec: H264_VIDEO_CODEC,
        originalKey: OLD_KEY,
        originalContentType: 'video/quicktime',
        originalSizeBytes: 9_000,
        originalFingerprint: `fp:${OLD_KEY}`,
      });
      await expect(videoModel.exists({ _id: replacementId })).resolves.toBeNull();
      await expect(videoModel.countDocuments({})).resolves.toBe(1);
    });

    it('ни один объект не удаляется и в журнал сирот ничего не попадает: ни исходник, ни новый', async () => {
      const targetId = await seed({ key: OLD_KEY });
      const replacementId = await seed({ key: NEW_KEY, codec: 'avc' });

      await replace(targetId, replacementId);

      expect(removed).toEqual([]);
      expect(await journalKeys()).toEqual([]);
    });

    it('кадр цели остаётся, если он был', async () => {
      const targetId = await seed({ key: OLD_KEY, poster: JPEG_OLD });
      const replacementId = await seed({ key: NEW_KEY, codec: 'avc', poster: JPEG_NEW });

      await replace(targetId, replacementId);

      const doc = await readTarget(targetId);
      expect(binaryToBuffer(doc?.poster)).toEqual(JPEG_OLD);
    });

    it('у цели нет кадра — берётся кадр замены', async () => {
      const targetId = await seed({ key: OLD_KEY });
      const replacementId = await seed({ key: NEW_KEY, codec: 'avc', poster: JPEG_NEW });

      await replace(targetId, replacementId);

      const doc = await readTarget(targetId);
      expect(binaryToBuffer(doc?.poster)).toEqual(JPEG_NEW);
    });

    it('кэш file_id Telegram сброшен: бот отправит новый файл заново', async () => {
      const targetId = await seed({ key: OLD_KEY, telegramFileId: 'tg-cache' });
      const replacementId = await seed({ key: NEW_KEY, codec: 'avc' });

      await replace(targetId, replacementId);

      const raw = await videoModel.collection.findOne({
        _id: new Types.ObjectId(targetId),
      });
      expect(raw).not.toHaveProperty('telegramFileId');
    });

    it('видео без поля status и без отпечатка (до ADR-0165) заменяется, originalFingerprint не пишется', async () => {
      const legacy = await videoModel.collection.insertOne({
        key: OLD_KEY,
        contentType: 'video/mp4',
        sizeBytes: 500,
        createdAt: NOW.minus({ days: 90 }).toJSDate(),
        updatedAt: NOW.minus({ days: 90 }).toJSDate(),
      });
      const replacementId = await seed({ key: NEW_KEY, codec: 'avc' });

      await replace(legacy.insertedId.toString(), replacementId);

      const raw = await videoModel.collection.findOne({ _id: legacy.insertedId });
      expect(raw).toMatchObject({ key: NEW_KEY, originalKey: OLD_KEY });
      expect(raw).not.toHaveProperty('originalFingerprint');
    });

    it('замена в пределах срока принимается, сразу за ним — нет', async () => {
      const targetId = await seed({ key: OLD_KEY });
      const justInside = await seed({
        key: NEW_KEY,
        codec: 'avc',
        ageHours: REPLACEMENT_MAX_AGE_HOURS - 0.5,
      });
      const tooOld = await seed({
        key: 'exam-videos/too-old',
        codec: 'avc',
        ageHours: REPLACEMENT_MAX_AGE_HOURS + 0.5,
      });

      await expect(replace(targetId, tooOld)).rejects.toMatchObject({
        message: EXAM_VIDEO_REPLACE_STALE_MESSAGE,
      });
      await expect(replace(targetId, justInside)).resolves.toMatchObject({
        id: targetId,
      });
    });
  });

  describe('отказы: ничего не меняется', () => {
    async function expectUntouched(targetId: string, replacementId?: string) {
      const doc = await readTarget(targetId);
      expect(doc).toMatchObject({ key: OLD_KEY });
      expect(doc).not.toHaveProperty('originalKey');
      if (replacementId) {
        await expect(videoModel.exists({ _id: replacementId })).resolves.not.toBeNull();
      }
      expect(removed).toEqual([]);
      expect(await journalKeys()).toEqual([]);
    }

    it('сама на себя — 400', async () => {
      const targetId = await seed({ key: OLD_KEY, codec: 'avc' });

      const failure = replace(targetId, targetId);

      await expect(failure).rejects.toBeInstanceOf(InvalidInputError);
      await expect(failure).rejects.toMatchObject({
        message: EXAM_VIDEO_REPLACE_SELF_MESSAGE,
      });
      await expectUntouched(targetId);
    });

    it('цели нет, id кривой или цель ещё грузится — 404', async () => {
      const replacementId = await seed({ key: NEW_KEY, codec: 'avc' });
      const uploading = await seed({ key: OLD_KEY, status: 'uploading' });

      for (const id of [new Types.ObjectId().toString(), 'не-id', uploading]) {
        await expect(replace(id, replacementId)).rejects.toBeInstanceOf(NotFoundError);
      }
      await expect(replace('не-id', replacementId)).rejects.toMatchObject({
        message: EXAM_VIDEO_NOT_FOUND_MESSAGE,
      });
      await expect(videoModel.exists({ _id: replacementId })).resolves.not.toBeNull();
    });

    it('замены нет или id кривой — 400 с текстом «не найдено»; замена ещё грузится — 400 с текстом про загрузку', async () => {
      const targetId = await seed({ key: OLD_KEY });
      const uploading = await seed({ key: NEW_KEY, status: 'uploading' });

      for (const id of [new Types.ObjectId().toString(), 'не-id']) {
        const failure = replace(targetId, id);
        await expect(failure).rejects.toBeInstanceOf(InvalidInputError);
        await expect(failure).rejects.toMatchObject({
          message: EXAM_VIDEO_NOT_FOUND_MESSAGE,
        });
      }
      await expect(replace(targetId, uploading)).rejects.toMatchObject({
        message: EXAM_VIDEO_UPLOADING_MESSAGE,
      });
      await expectUntouched(targetId, uploading);
    });

    it('кодек замены не avc или не записан — 400', async () => {
      const targetId = await seed({ key: OLD_KEY });
      const hevc = await seed({ key: NEW_KEY, codec: 'hevc' });
      const unknown = await seed({ key: 'exam-videos/unknown' });

      for (const id of [hevc, unknown]) {
        const failure = replace(targetId, id);
        await expect(failure).rejects.toBeInstanceOf(InvalidInputError);
        await expect(failure).rejects.toMatchObject({
          message: EXAM_VIDEO_REPLACE_NOT_H264_MESSAGE,
        });
      }
      await expectUntouched(targetId, hevc);
    });

    it('замена слишком старая — 400, чтобы уборщик сирот не удалил объект из-под цели', async () => {
      const targetId = await seed({ key: OLD_KEY });
      const old = await seed({ key: NEW_KEY, codec: 'avc', ageHours: 20 });

      const failure = replace(targetId, old);

      await expect(failure).rejects.toBeInstanceOf(InvalidInputError);
      await expect(failure).rejects.toMatchObject({
        message: EXAM_VIDEO_REPLACE_STALE_MESSAGE,
      });
      await expectUntouched(targetId, old);
    });

    it('на замену ссылается вопрос банка — 409, документ замены цел', async () => {
      const targetId = await seed({ key: OLD_KEY });
      const replacementId = await seed({ key: NEW_KEY, codec: 'avc' });
      await itemModel.create({
        kind: 'text',
        prompt: 'вопрос',
        videoIds: [new Types.ObjectId(replacementId)],
      });

      const failure = replace(targetId, replacementId);

      await expect(failure).rejects.toBeInstanceOf(ConflictError);
      await expect(failure).rejects.toMatchObject({
        message: EXAM_VIDEO_REPLACE_USED_MESSAGE,
      });
      await expectUntouched(targetId, replacementId);
    });

    it('на замену ссылается снимок попытки — 409, документ замены цел', async () => {
      const targetId = await seed({ key: OLD_KEY });
      const replacementId = await seed({ key: NEW_KEY, codec: 'avc' });
      await attemptModel.create({
        examId: new Types.ObjectId(),
        examTitle: 'Экзамен',
        userId: new Types.ObjectId(),
        attemptNo: 1,
        startedAt: NOW.toJSDate(),
        videoIds: [new Types.ObjectId(replacementId)],
      });

      await expect(replace(targetId, replacementId)).rejects.toMatchObject({
        message: EXAM_VIDEO_REPLACE_USED_MESSAGE,
      });
      await expectUntouched(targetId, replacementId);
    });

    it('ссылка на саму цель заменой не мешает: цель на месте и в вопросе', async () => {
      const targetId = await seed({ key: OLD_KEY });
      const replacementId = await seed({ key: NEW_KEY, codec: 'avc' });
      await itemModel.create({
        kind: 'text',
        prompt: 'вопрос',
        videoIds: [new Types.ObjectId(targetId)],
      });

      await expect(replace(targetId, replacementId)).resolves.toMatchObject({
        id: targetId,
      });
    });
  });

  describe('исходный файл пишется один раз', () => {
    it('второй перегон отвергается 409, original* первого перегона не меняются', async () => {
      const targetId = await seed({ key: OLD_KEY, sizeBytes: 9_000 });
      const first = await seed({ key: NEW_KEY, codec: 'avc', sizeBytes: 3_000 });
      const second = await seed({ key: 'exam-videos/second', codec: 'avc' });
      await replace(targetId, first);

      const failure = replace(targetId, second);

      await expect(failure).rejects.toBeInstanceOf(ConflictError);
      await expect(failure).rejects.toMatchObject({
        message: EXAM_VIDEO_ALREADY_REPLACED_MESSAGE,
      });
      const doc = await readTarget(targetId);
      expect(doc).toMatchObject({
        key: NEW_KEY,
        originalKey: OLD_KEY,
        originalSizeBytes: 9_000,
      });
      // Вторая замена осталась обычной загрузкой для уборщика.
      await expect(videoModel.exists({ _id: second })).resolves.not.toBeNull();
      expect(removed).toEqual([]);
      expect(await journalKeys()).toEqual([]);
    });
  });

  describe('гонки и падения между шагами', () => {
    /** Выполнить `during` ровно между проверками (шаг 0) и забором замены (шаг 1):
     * сверка ссылок — последнее чтение перед `findOneAndDelete`. */
    function interleave(during: () => Promise<unknown>): void {
      const original = itemModel.distinct.bind(itemModel) as (
        field: string,
        filter: object,
      ) => Promise<unknown>;
      const delayed = (field: string, filter: object): Promise<unknown> =>
        during().then(() => original(field, filter));
      jest
        .spyOn(itemModel, 'distinct')
        .mockImplementation(delayed as unknown as typeof itemModel.distinct);
    }

    it('цель успели заменить другим запросом: 409, ключ замены уходит обычным путём, ключ цели не трогается', async () => {
      const targetId = await seed({ key: OLD_KEY });
      const replacementId = await seed({ key: NEW_KEY, codec: 'avc' });
      interleave(() =>
        videoModel.updateOne(
          { _id: targetId },
          { $set: { key: 'exam-videos/rival', originalKey: OLD_KEY } },
        ),
      );

      const failure = replace(targetId, replacementId);

      await expect(failure).rejects.toBeInstanceOf(ConflictError);
      await expect(failure).rejects.toMatchObject({
        message: EXAM_VIDEO_REPLACE_LOST_MESSAGE,
      });
      expect(await readTarget(targetId)).toMatchObject({
        key: 'exam-videos/rival',
        originalKey: OLD_KEY,
      });
      await expect(videoModel.exists({ _id: replacementId })).resolves.toBeNull();
      // Удалён ровно ключ проигравшей замены; исходник — никогда.
      expect(removed).toEqual([NEW_KEY]);
      expect(removed).not.toContain(OLD_KEY);
      expect(await journalKeys()).toEqual([]);
    });

    it('хранилище не отвечает: в журнале остаётся только ключ замены, исходник в журнал не попадает', async () => {
      const targetId = await seed({ key: OLD_KEY });
      const replacementId = await seed({ key: NEW_KEY, codec: 'avc' });
      failRemove = true;
      interleave(() =>
        videoModel.updateOne({ _id: targetId }, { $set: { key: 'exam-videos/rival' } }),
      );

      await expect(replace(targetId, replacementId)).rejects.toBeInstanceOf(
        ConflictError,
      );

      expect(await journalKeys()).toEqual([NEW_KEY]);
    });

    it('цель получила originalKey между проверкой и записью: 409, первый оригинал не перезаписан', async () => {
      const targetId = await seed({ key: OLD_KEY });
      const replacementId = await seed({ key: NEW_KEY, codec: 'avc' });
      interleave(() =>
        videoModel.updateOne(
          { _id: targetId },
          { $set: { originalKey: 'exam-videos/first' } },
        ),
      );

      await expect(replace(targetId, replacementId)).rejects.toMatchObject({
        message: EXAM_VIDEO_REPLACE_LOST_MESSAGE,
      });

      expect(await readTarget(targetId)).toMatchObject({
        key: OLD_KEY,
        originalKey: 'exam-videos/first',
      });
      expect(removed).toEqual([NEW_KEY]);
    });

    it('замену успели забрать другим запросом: 409, ничего не удалено, цель цела', async () => {
      const targetId = await seed({ key: OLD_KEY });
      const replacementId = await seed({ key: NEW_KEY, codec: 'avc' });
      interleave(() => videoModel.deleteOne({ _id: replacementId }));

      await expect(replace(targetId, replacementId)).rejects.toMatchObject({
        message: EXAM_VIDEO_REPLACE_LOST_MESSAGE,
      });

      expect(await readTarget(targetId)).toMatchObject({ key: OLD_KEY });
      // Объект забравшего замену теперь принадлежит ему: проигравший его не трогает.
      expect(removed).toEqual([]);
      expect(await journalKeys()).toEqual([]);
    });

    it('две замены одной цели разом: ровно одна применяется, исходник — прежний ключ цели', async () => {
      const targetId = await seed({ key: OLD_KEY });
      const first = await seed({ key: 'exam-videos/first', codec: 'avc' });
      const second = await seed({ key: 'exam-videos/second', codec: 'avc' });

      const results = await Promise.allSettled([
        replace(targetId, first),
        replace(targetId, second),
      ]);

      const winners = results.filter((result) => result.status === 'fulfilled');
      const losers = results.filter((result) => result.status === 'rejected');
      expect(winners).toHaveLength(1);
      expect(losers).toHaveLength(1);
      expect((losers[0] as PromiseRejectedResult).reason).toBeInstanceOf(ConflictError);
      const doc = await readTarget(targetId);
      expect(doc?.originalKey).toBe(OLD_KEY);
      expect(['exam-videos/first', 'exam-videos/second']).toContain(doc?.key);
      expect(removed).not.toContain(OLD_KEY);
      expect(removed).not.toContain(doc?.key);
      expect(await journalKeys()).not.toContain(OLD_KEY);
    });

    it('падение после забора замены (до записи в цель): цель и исходник не тронуты, объекты не удалены', async () => {
      const targetId = await seed({ key: OLD_KEY, sizeBytes: 9_000 });
      const replacementId = await seed({ key: NEW_KEY, codec: 'avc' });
      jest.spyOn(videoModel, 'findOneAndUpdate').mockImplementation(() => {
        throw new Error('процесс упал между шагами');
      });

      await expect(replace(targetId, replacementId)).rejects.toThrow('процесс упал');

      jest.restoreAllMocks();
      const doc = await readTarget(targetId);
      expect(doc).toMatchObject({ key: OLD_KEY, sizeBytes: 9_000 });
      expect(doc).not.toHaveProperty('originalKey');
      expect(doc).not.toHaveProperty('videoCodec');
      // Замену забрали, её объект лежит без документа (плата за хранение), и никто
      // его не удаляет: неизвестно, применилась ли запись в цель.
      await expect(videoModel.exists({ _id: replacementId })).resolves.toBeNull();
      expect(removed).toEqual([]);
      expect(await journalKeys()).toEqual([]);
    });
  });
});
