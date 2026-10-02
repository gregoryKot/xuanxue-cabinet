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
  // что у signedUrl (loadAccessibleDoc), вторую проверку не пишем.
  describe('loadForBot', () => {
    it('штат — байты и тип, telegramFileId не задан у нового видео', async () => {
      const dto = await service.upload(MP4, undefined, NOW);
      const loaded = await service.loadForBot(
        dto.id,
        userLean({ roles: ['teacher'] }),
        NOW,
      );
      expect(loaded.bytes).toEqual(MP4);
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
      expect(loaded.bytes).toEqual(MP4);
    });

    it('R2 выключен — NotAvailableError (бот показывает деградацию, не отказ)', async () => {
      const dto = await service.upload(MP4, undefined, NOW);
      store.enabled.value = false;

      await expect(
        service.loadForBot(dto.id, userLean({ roles: ['teacher'] }), NOW),
      ).rejects.toBeInstanceOf(NotAvailableError);
    });

    it('запомненный telegramFileId возвращается расшифрованным', async () => {
      const dto = await service.upload(MP4, undefined, NOW);
      await service.rememberTelegramFileId(dto.id, 'tg-file-1');

      const loaded = await service.loadForBot(
        dto.id,
        userLean({ roles: ['teacher'] }),
        NOW,
      );
      expect(loaded.telegramFileId).toBe('tg-file-1');
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
});
