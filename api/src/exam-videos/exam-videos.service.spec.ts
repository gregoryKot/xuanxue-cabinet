// Против настоящей Mongo (mongodb-memory-server, не мок — CLAUDE.md
// «Тесты», образец exam-images.service.spec.ts): upload кладёт объект в
// хранилище (фейк с Map вместо R2) и пишет запись, signedUrl отдаёт штату по
// роли или ученику по снимку его попытки (SECURITY §3, ADR-0133).
import { DateTime } from 'luxon';
import type { Connection, Model } from 'mongoose';
import { Types } from 'mongoose';
import type { UserRole } from '@xuanxue/shared';
import type { UserLean } from '../users/users.service';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import {
  EXAM_VIDEO_NOT_FOUND_MESSAGE,
  EXAM_VIDEO_UPLOADING_MESSAGE,
} from '@xuanxue/shared';
import { InvalidInputError, NotAvailableError, NotFoundError } from '../common/errors';
import { ExamAttemptRecord, ExamAttemptSchema } from '../exams/exam-attempt.schema';
import type { FileStoreService } from '../storage/file-store.service';
import {
  StorageOrphanRecord,
  StorageOrphanSchema,
} from '../storage/storage-orphan.schema';
import { StorageOrphansService } from '../storage/storage-orphans.service';
import { ExamVideoRecord, ExamVideoSchema } from './exam-video.schema';
import { ExamVideosService } from './exam-videos.service';

const NOW = DateTime.utc(2026, 9, 23, 10, 0, 0);
// ISO-BMFF minimal fixture: ftyp isom (см. common/raw-upload.spec.ts).
const MP4 = Buffer.concat([
  Buffer.from([0, 0, 0, 0x20]),
  Buffer.from('ftyp', 'ascii'),
  Buffer.from('isom', 'ascii'),
  Buffer.alloc(4),
]);

function userLean(overrides: Partial<UserLean> = {}): UserLean {
  return {
    id: new Types.ObjectId().toString(),
    name: 'Т',
    roles: [] as UserRole[],
    status: 'active',
    studentMode: false,
    ...overrides,
  };
}

/** Фейк хранилища: объекты в Map, отказ включается флагом — тот же приём,
 * что material-files.service.spec.ts. */
function fakeFileStore(): {
  fileStore: FileStoreService;
  objects: Map<string, Buffer>;
  enabled: { value: boolean };
} {
  const objects = new Map<string, Buffer>();
  const enabled = { value: true };
  const fileStore = {
    get isEnabled() {
      return enabled.value;
    },
    put: ({ key, bytes }: { key: string; bytes: Buffer }) => {
      if (!enabled.value) return Promise.reject(new NotAvailableError('выключено'));
      objects.set(key, bytes);
      return Promise.resolve();
    },
    remove: (key: string) => {
      objects.delete(key);
      return Promise.resolve();
    },
    get: (key: string) => {
      if (!enabled.value) return Promise.reject(new NotAvailableError('выключено'));
      const bytes = objects.get(key);
      return bytes
        ? Promise.resolve(bytes)
        : Promise.reject(new NotAvailableError('404'));
    },
    signedGetUrl: (key: string) => `https://fake-r2.example/${key}?X-Amz-Signature=ab`,
  } as unknown as FileStoreService;
  return { fileStore, objects, enabled };
}

describe('ExamVideosService', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let videoModel: Model<ExamVideoRecord>;
  let attemptModel: Model<ExamAttemptRecord>;
  let orphanModel: Model<StorageOrphanRecord>;
  let service: ExamVideosService;
  let store: ReturnType<typeof fakeFileStore>;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    videoModel = connection.model<ExamVideoRecord>(ExamVideoRecord.name, ExamVideoSchema);
    attemptModel = connection.model<ExamAttemptRecord>(
      ExamAttemptRecord.name,
      ExamAttemptSchema,
    );
    orphanModel = connection.model<StorageOrphanRecord>(
      StorageOrphanRecord.name,
      StorageOrphanSchema,
    );
    store = fakeFileStore();
    const orphans = new StorageOrphansService(orphanModel, store.fileStore);
    service = new ExamVideosService(videoModel, attemptModel, store.fileStore, orphans);
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  afterEach(async () => {
    store.objects.clear();
    store.enabled.value = true;
    await Promise.all([
      videoModel.deleteMany({}),
      attemptModel.deleteMany({}),
      orphanModel.deleteMany({}),
    ]);
  });

  async function seedAttempt(userId: string, videoIds: string[] = []): Promise<void> {
    await attemptModel.create({
      examId: new Types.ObjectId(),
      examTitle: 'Т',
      userId: new Types.ObjectId(userId),
      attemptNo: 1,
      startedAt: new Date('2026-09-12T10:00:00.000Z'),
      videoIds: videoIds.map((id) => new Types.ObjectId(id)),
    });
  }

  describe('upload', () => {
    it('MP4 — DTO без key, sizeBytes и id верные, объект лёг в хранилище', async () => {
      const dto = await service.upload(MP4, new Types.ObjectId().toString(), NOW);

      expect(dto.contentType).toBe('video/mp4');
      expect(dto.sizeBytes).toBe(MP4.length);
      expect(typeof dto.id).toBe('string');
      expect(dto).not.toHaveProperty('key');
      expect(store.objects.size).toBe(1);
    });

    it('после удачной загрузки журнал сирот пуст (ADR-0079)', async () => {
      await service.upload(MP4, new Types.ObjectId().toString(), NOW);

      expect(await orphanModel.countDocuments({})).toBe(0);
    });

    it('R2 выключен — NotAvailableError, запись не создаётся', async () => {
      store.enabled.value = false;

      await expect(
        service.upload(MP4, new Types.ObjectId().toString(), NOW),
      ).rejects.toBeInstanceOf(NotAvailableError);
      expect(await videoModel.countDocuments({})).toBe(0);
    });

    // Программно невозможный случай (защита в глубину) — тот же приём, что у
    // ExamImagesService.upload/ExamItemsService.create.
    it('findById сразу после create не находит документ — Error', async () => {
      const findById = jest
        .spyOn(videoModel, 'findById')
        .mockReturnValueOnce({ lean: () => Promise.resolve(null) } as never);

      await expect(
        service.upload(MP4, new Types.ObjectId().toString(), NOW),
      ).rejects.toThrow('запись не найдена сразу после создания');

      findById.mockRestore();
    });
  });

  describe('assertExist', () => {
    it('пустой список — не ходит в базу, не бросает', async () => {
      await expect(service.assertExist([])).resolves.toBeUndefined();
    });

    it('невалидный ObjectId — InvalidInputError', async () => {
      await expect(service.assertExist(['not-an-id'])).rejects.toBeInstanceOf(
        InvalidInputError,
      );
    });

    it('несуществующий id — InvalidInputError', async () => {
      await expect(
        service.assertExist([new Types.ObjectId().toString()]),
      ).rejects.toBeInstanceOf(InvalidInputError);
    });

    it('существующий id — проходит', async () => {
      const dto = await service.upload(MP4, undefined, NOW);
      await expect(service.assertExist([dto.id])).resolves.toBeUndefined();
    });
  });

  describe('signedUrl', () => {
    it('штат — по роли, без снимка попытки', async () => {
      const dto = await service.upload(MP4, undefined, NOW);
      const url = await service.signedUrl(dto.id, userLean({ roles: ['teacher'] }), NOW);
      expect(url).toContain('fake-r2.example');
    });

    it('ученик без своей попытки — 404 (не подтверждаем существование)', async () => {
      const dto = await service.upload(MP4, undefined, NOW);
      await expect(
        service.signedUrl(dto.id, userLean({ roles: [] }), NOW),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('ученик со своей попыткой — 302 на подписанную ссылку', async () => {
      const dto = await service.upload(MP4, undefined, NOW);
      const user = userLean({ roles: [] });
      await seedAttempt(user.id, [dto.id]);

      const url = await service.signedUrl(dto.id, user, NOW);
      expect(url).toContain('fake-r2.example');
    });

    it('несуществующий id — тот же 404, что у чужого видео', async () => {
      await expect(
        service.signedUrl(new Types.ObjectId().toString(), userLean({ roles: [] }), NOW),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('несуществующий id для штата (роль не спрашивает попытку) — 404', async () => {
      await expect(
        service.signedUrl(
          new Types.ObjectId().toString(),
          userLean({ roles: ['teacher'] }),
          NOW,
        ),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  // 2026-09-27, «Уточнено» ADR-0133 — бот скачивает байты сам, доступ тот же,
  // что у signedUrl (loadAccessibleDoc), вторую проверку не пишем. Байты —
  // лениво, `loadBytes()` (аудит 2026-10-01, F02).
  describe('loadForBot', () => {
    it('штат — байты по loadBytes и тип, telegramFileId не задан у нового видео', async () => {
      const dto = await service.upload(MP4, undefined, NOW);
      const loaded = await service.loadForBot(
        dto.id,
        userLean({ roles: ['teacher'] }),
        NOW,
      );
      await expect(loaded.loadBytes()).resolves.toEqual(MP4);
      expect(loaded.contentType).toBe('video/mp4');
      expect(loaded.telegramFileId).toBeUndefined();
    });

    it('ученик без своей попытки — 404, тот же отказ, что у signedUrl', async () => {
      const dto = await service.upload(MP4, undefined, NOW);
      await expect(
        service.loadForBot(dto.id, userLean({ roles: [] }), NOW),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('ученик со своей попыткой — байты отдаются', async () => {
      const dto = await service.upload(MP4, undefined, NOW);
      const user = userLean({ roles: [] });
      await seedAttempt(user.id, [dto.id]);

      const loaded = await service.loadForBot(dto.id, user, NOW);
      await expect(loaded.loadBytes()).resolves.toEqual(MP4);
    });

    it('R2 выключен — запись отдаётся, NotAvailableError бросает только loadBytes()', async () => {
      const dto = await service.upload(MP4, undefined, NOW);
      store.enabled.value = false;

      const loaded = await service.loadForBot(
        dto.id,
        userLean({ roles: ['teacher'] }),
        NOW,
      );
      await expect(loaded.loadBytes()).rejects.toBeInstanceOf(NotAvailableError);
    });

    // F02: с известным file_id объект R2 (до 50 МБ) в память не ложится.
    it('запомненный telegramFileId возвращается расшифрованным, хранилище не читается', async () => {
      const dto = await service.upload(MP4, undefined, NOW);
      await service.rememberTelegramFileId(dto.id, 'tg-file-1');
      const get = jest.spyOn(store.fileStore, 'get');

      const loaded = await service.loadForBot(
        dto.id,
        userLean({ roles: ['teacher'] }),
        NOW,
      );

      expect(loaded.telegramFileId).toBe('tg-file-1');
      expect(get).not.toHaveBeenCalled();
      get.mockRestore();
    });

    // F02: N учеников открыли один видео-вопрос — один объект из R2 на всех.
    it('N параллельных loadBytes одного видео — одно чтение из хранилища', async () => {
      const dto = await service.upload(MP4, undefined, NOW);
      const get = jest.spyOn(store.fileStore, 'get');
      const staff = userLean({ roles: ['teacher'] });

      const loaded = await Promise.all([
        service.loadForBot(dto.id, staff, NOW),
        service.loadForBot(dto.id, staff, NOW),
        service.loadForBot(dto.id, staff, NOW),
      ]);
      const bytes = await Promise.all(loaded.map((video) => video.loadBytes()));

      expect(bytes).toEqual([MP4, MP4, MP4]);
      expect(get).toHaveBeenCalledTimes(1);
      // Полёт закончился — следующее чтение идёт в хранилище заново.
      await loaded[0]?.loadBytes();
      expect(get).toHaveBeenCalledTimes(2);
      get.mockRestore();
    });
  });

  describe('rememberTelegramFileId', () => {
    it('пишет file_id зашифрованным полем (не читается напрямую из базы)', async () => {
      const dto = await service.upload(MP4, undefined, NOW);
      await service.rememberTelegramFileId(dto.id, 'tg-file-2');

      const raw = await videoModel.findById(dto.id).lean();
      expect(raw?.telegramFileId).toBeDefined();
      expect(raw?.telegramFileId).not.toBe('tg-file-2');
    });

    it('невалидный id — молча пропускает, не бросает', async () => {
      await expect(
        service.rememberTelegramFileId('not-an-id', 'tg-file-3'),
      ).resolves.toBeUndefined();
    });
  });

  // ADR-0165: видео, которое грузится частями, ни показать, ни привязать к
  // вопросу нельзя; прежнее без поля status (до миграции) — готовое.
  describe('готовность видео', () => {
    async function insertVideo(extra: Record<string, unknown>): Promise<string> {
      const doc = await videoModel.collection.insertOne({
        key: `exam-videos/${new Types.ObjectId().toString()}`,
        contentType: 'video/mp4',
        sizeBytes: MP4.length,
        ...extra,
      });
      store.objects.set(
        (await videoModel.findById(doc.insertedId).lean())?.key ?? '',
        MP4,
      );
      return doc.insertedId.toString();
    }

    it('загрузка не окончена — assertExist отказывает словами про загрузку, не «не найдено»', async () => {
      const id = await insertVideo({ status: 'uploading', fingerprint: 'f' });

      const failure = service.assertExist([id]);

      await expect(failure).rejects.toBeInstanceOf(InvalidInputError);
      await expect(failure).rejects.toThrow(EXAM_VIDEO_UPLOADING_MESSAGE);
    });

    it('готовое вместе с неоконченным — отказ из-за неоконченного', async () => {
      const ready = await insertVideo({ status: 'ready', fingerprint: 'a' });
      const uploading = await insertVideo({ status: 'uploading', fingerprint: 'b' });

      await expect(service.assertExist([ready, uploading])).rejects.toThrow(
        EXAM_VIDEO_UPLOADING_MESSAGE,
      );
    });

    it('несуществующее вместе с неоконченным — «не найдено»: сказать нечего о том, чего нет', async () => {
      const uploading = await insertVideo({ status: 'uploading', fingerprint: 'b' });

      await expect(
        service.assertExist([uploading, new Types.ObjectId().toString()]),
      ).rejects.toThrow(EXAM_VIDEO_NOT_FOUND_MESSAGE);
    });

    it('готовое и запись без status (до миграции) проходят assertExist', async () => {
      const ready = await insertVideo({ status: 'ready', fingerprint: 'a' });
      const legacy = await insertVideo({});

      await expect(service.assertExist([ready, legacy])).resolves.toBeUndefined();
    });

    it('signedUrl и loadForBot для неоконченного — 404 даже штату', async () => {
      const id = await insertVideo({ status: 'uploading', fingerprint: 'f' });
      const teacher = userLean({ roles: ['teacher'] });

      await expect(service.signedUrl(id, teacher, NOW)).rejects.toBeInstanceOf(
        NotFoundError,
      );
      await expect(service.loadForBot(id, teacher, NOW)).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });

    it('запись без status отдаётся плееру и боту как готовая', async () => {
      const id = await insertVideo({});
      const teacher = userLean({ roles: ['teacher'] });

      await expect(service.signedUrl(id, teacher, NOW)).resolves.toContain('fake-r2');
      const loaded = await service.loadForBot(id, teacher, NOW);
      expect(loaded.contentType).toBe('video/mp4');
    });

    it('у готового видео нет contentType — повреждённая запись, ошибка, а не выдуманный тип', async () => {
      const id = await insertVideo({ status: 'ready', fingerprint: 'x' });
      await videoModel.collection.updateOne(
        { _id: new Types.ObjectId(id) },
        { $unset: { contentType: 1 } },
      );

      await expect(
        service.loadForBot(id, userLean({ roles: ['teacher'] }), NOW),
      ).rejects.toThrow('нет contentType');
    });

    it('прежняя сырая загрузка пишет готовое видео с отпечатком-заглушкой', async () => {
      const dto = await service.upload(MP4, undefined, NOW);

      const doc = await videoModel.findById(dto.id).lean();
      expect(doc?.status).toBe('ready');
      expect(doc?.fingerprint).toMatch(/^raw:exam-videos\//);
    });
  });

  // ADR-0165: кадр-превью — те же права, что у видео (loadAccessibleDoc), тот же 404.
  describe('loadPoster', () => {
    const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 5, 6, 7]);

    async function insertWithPoster(
      extra: Record<string, unknown> = {},
    ): Promise<string> {
      const doc = await videoModel.create({
        key: `exam-videos/${new Types.ObjectId().toString()}`,
        contentType: 'video/mp4',
        sizeBytes: 10,
        fingerprint: 'f',
        status: 'ready',
        poster: JPEG,
        ...extra,
      });
      return doc._id.toString();
    }

    it('штат получает те же байты (read-after-write)', async () => {
      const id = await insertWithPoster();

      await expect(
        service.loadPoster(id, userLean({ roles: ['teacher'] })),
      ).resolves.toEqual(JPEG);
    });

    it('ученик со своей попыткой получает кадр, без попытки — NotFoundError', async () => {
      const id = await insertWithPoster();
      const student = userLean({ roles: [] });

      await expect(service.loadPoster(id, student)).rejects.toBeInstanceOf(NotFoundError);
      await seedAttempt(student.id, [id]);
      await expect(service.loadPoster(id, student)).resolves.toEqual(JPEG);
    });

    it('у видео нет кадра — null (старые видео и завершённые без кадра)', async () => {
      const id = await insertWithPoster({ poster: undefined });

      await expect(
        service.loadPoster(id, userLean({ roles: ['teacher'] })),
      ).resolves.toBeNull();
    });

    it('видео ещё грузится — NotFoundError даже штату', async () => {
      const id = await insertWithPoster({ status: 'uploading' });

      await expect(
        service.loadPoster(id, userLean({ roles: ['teacher'] })),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('запись без status (до миграции) считается готовой и отдаёт кадр, если он есть', async () => {
      const raw = await videoModel.collection.insertOne({
        key: 'exam-videos/legacy',
        contentType: 'video/mp4',
        sizeBytes: 1,
        poster: JPEG,
      });

      await expect(
        service.loadPoster(raw.insertedId.toString(), userLean({ roles: ['teacher'] })),
      ).resolves.toEqual(JPEG);
    });

    it('несуществующий и невалидный id — NotFoundError', async () => {
      const teacher = userLean({ roles: ['teacher'] });

      await expect(
        service.loadPoster(new Types.ObjectId().toString(), teacher),
      ).rejects.toBeInstanceOf(NotFoundError);
      await expect(service.loadPoster('не-id', teacher)).rejects.toBeInstanceOf(
        NotFoundError,
      );
    });

    it('signedUrl и loadForBot кадр не читают: записи без +poster пусты', async () => {
      const id = await insertWithPoster();
      const teacher = userLean({ roles: ['teacher'] });

      await service.signedUrl(id, teacher, NOW);
      await service.loadForBot(id, teacher, NOW);

      expect(await videoModel.findById(id).lean()).not.toHaveProperty('poster');
    });
  });
});
