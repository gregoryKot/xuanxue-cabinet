// Против настоящей Mongo (mongodb-memory-server, не мок модели — CLAUDE.md
// «Тесты»): `$set`/`$unset` пяти полей файла и read-after-write проверяются
// на реальном документе. Хранилище — фейк с Map вместо R2 (в сеть из тестов
// не ходим), журнал сирот — настоящий: порядок «запись раньше объекта»
// (ADR-0079) без него не проверить.
//
// Право «закрытый материал файла не отдаёт» кроет ещё и e2e
// (api/test/material-files.e2e-spec.ts) — тут та же проверка без HTTP.
import { DateTime } from 'luxon';
import { Types, type Connection, type Model } from 'mongoose';
import { ClassRecord, ClassSchema } from '../classes/class.schema';
import { LessonRecord, LessonSchema } from '../lessons/lesson.schema';
import { SettingsRecord, SettingsSchema } from '../settings/settings.schema';
import { SettingsService } from '../settings/settings.service';
import {
  StorageOrphanRecord,
  StorageOrphanSchema,
} from '../storage/storage-orphan.schema';
import { StorageOrphansService } from '../storage/storage-orphans.service';
import type { FileStoreService } from '../storage/file-store.service';
import { UserRecord, UserSchema } from '../users/user.schema';
import { UsersService } from '../users/users.service';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { MaterialFilesService } from './material-files.service';
import { MaterialRecord, MaterialSchema } from './material.schema';
import { MaterialsService } from './materials.service';

const NOW = DateTime.utc(2026, 9, 20, 12, 0, 0);
const AUTHOR_ID = new Types.ObjectId().toString();
const PDF = Buffer.concat([Buffer.from('%PDF-1.7\n', 'ascii'), Buffer.alloc(32)]);

/** Фейк хранилища: объекты в Map, отказ включается флагом. Своё поведение
 * (SigV4, сеть) проверяет file-store.service.spec.ts. */
function fakeFileStore(): {
  fileStore: FileStoreService;
  objects: Map<string, Buffer>;
  setFailRemove: (fail: boolean) => void;
  setOnPut: (hook: (() => Promise<void>) | null) => void;
} {
  const objects = new Map<string, Buffer>();
  let failRemove = false;
  let onPut: (() => Promise<void>) | null = null;
  const fileStore = {
    isEnabled: true,
    put: async ({ key, bytes }: { key: string; bytes: Buffer }) => {
      objects.set(key, bytes);
      if (onPut) await onPut();
    },
    remove: (key: string) => {
      if (failRemove) return Promise.reject(new Error('R2 недоступен'));
      objects.delete(key);
      return Promise.resolve();
    },
    signedGetUrl: (key: string) => `https://fake/${key}?X-Amz-Signature=ab`,
  } as unknown as FileStoreService;
  return {
    fileStore,
    objects,
    setFailRemove: (fail: boolean) => {
      failRemove = fail;
    },
    setOnPut: (hook: (() => Promise<void>) | null) => {
      onPut = hook;
    },
  };
}

describe('MaterialFilesService', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let model: Model<MaterialRecord>;
  let orphanModel: Model<StorageOrphanRecord>;
  let settingsModel: Model<SettingsRecord>;
  let service: MaterialFilesService;
  let materialsService: MaterialsService;
  let store: ReturnType<typeof fakeFileStore>;
  let settingsService: SettingsService;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    model = connection.model<MaterialRecord>(MaterialRecord.name, MaterialSchema);
    orphanModel = connection.model<StorageOrphanRecord>(
      StorageOrphanRecord.name,
      StorageOrphanSchema,
    );
    settingsModel = connection.model<SettingsRecord>(SettingsRecord.name, SettingsSchema);
    const classModel = connection.model<ClassRecord>(ClassRecord.name, ClassSchema);
    const lessonModel = connection.model<LessonRecord>(LessonRecord.name, LessonSchema);
    const userModel = connection.model<UserRecord>(UserRecord.name, UserSchema);
    settingsService = new SettingsService(
      settingsModel,
      lessonModel,
      classModel,
      new UsersService(userModel),
    );
    store = fakeFileStore();
    const orphans = new StorageOrphansService(orphanModel, store.fileStore);
    service = new MaterialFilesService(model, settingsService, store.fileStore, orphans);
    materialsService = new MaterialsService(model, classModel, settingsService, orphans);
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  afterEach(async () => {
    store.objects.clear();
    store.setFailRemove(false);
    store.setOnPut(null);
    await Promise.all([
      model.deleteMany({}),
      orphanModel.deleteMany({}),
      settingsModel.deleteMany({}),
    ]);
  });

  async function newMaterial(access: 'all' | 'paid' = 'all'): Promise<string> {
    const dto = await materialsService.create(
      { title: 'Методичка', url: 'https://example.com/m', kind: 'document', access },
      AUTHOR_ID,
    );
    return dto.id;
  }

  describe('upload', () => {
    it('кладёт объект, пишет пять полей и отдаёт описание файла', async () => {
      const id = await newMaterial();

      const dto = await service.upload(id, PDF, 'Методичка по ба-гуа.pdf', NOW);

      expect(dto.file).toEqual({
        name: 'Методичка по ба-гуа.pdf',
        contentType: 'application/pdf',
        sizeBytes: PDF.length,
        uploadedAt: NOW.toISO({ suppressMilliseconds: false }),
      });
      const [key] = [...store.objects.keys()];
      expect(key).toMatch(new RegExp(`^materials/${id}/`));
    });

    it('имя файла чистится до записи — перевод строки в него не попадает', async () => {
      const id = await newMaterial();

      const dto = await service.upload(id, PDF, 'дву\nстрочное.pdf', NOW);

      expect(dto.file?.name).not.toContain('\n');
    });

    // ADR-0079: запись в журнал снимается только после того, как на объект
    // сослался материал, — иначе сирота не находится ничем.
    it('после удачной загрузки журнал сирот пуст', async () => {
      const id = await newMaterial();

      await service.upload(id, PDF, 'Методичка.pdf', NOW);

      expect(await orphanModel.countDocuments({})).toBe(0);
    });

    it('замена файла уносит прежний объект', async () => {
      const id = await newMaterial();
      await service.upload(id, PDF, 'Первая.pdf', NOW);
      const [firstKey] = [...store.objects.keys()];

      await service.upload(id, PDF, 'Вторая.pdf', NOW);

      expect(store.objects.size).toBe(1);
      expect(store.objects.has(firstKey ?? '')).toBe(false);
    });

    it('прежний объект не удалился — его ключ остаётся журналу', async () => {
      const id = await newMaterial();
      await service.upload(id, PDF, 'Первая.pdf', NOW);
      const [firstKey] = [...store.objects.keys()];
      store.setFailRemove(true);

      await service.upload(id, PDF, 'Вторая.pdf', NOW);

      expect(await orphanModel.findOne({ key: firstKey }).lean()).not.toBeNull();
    });

    it('материала нет — 404 и объект в хранилище не остаётся', async () => {
      const id = new Types.ObjectId().toString();

      await expect(service.upload(id, PDF, 'Методичка.pdf', NOW)).rejects.toMatchObject({
        status: 404,
      });
      expect(store.objects.size).toBe(0);
    });

    // Материал успели удалить, пока шли байты. Детерминизм — не таймер, а
    // удаление внутри фейкового `put`: он вызывается ровно между проверкой
    // существования и записью полей (ADR-0079).
    it('материал удалили во время загрузки — 404, объект не остаётся в бакете', async () => {
      const id = await newMaterial();
      store.setOnPut(async () => {
        await model.deleteOne({ _id: id });
      });

      await expect(service.upload(id, PDF, 'Методичка.pdf', NOW)).rejects.toMatchObject({
        status: 404,
      });
      expect(store.objects.size).toBe(0);
      expect(await orphanModel.countDocuments({})).toBe(0);
    });

    it('кривой id — 404 раньше разбора тела', async () => {
      await expect(service.upload('не-id', PDF, 'x.pdf', NOW)).rejects.toMatchObject({
        status: 404,
      });
    });

    it('не тот формат — 400, в хранилище ничего не легло', async () => {
      const id = await newMaterial();

      await expect(
        service.upload(id, Buffer.from('просто текст', 'utf8'), 'x.pdf', NOW),
      ).rejects.toMatchObject({ status: 400 });
      expect(store.objects.size).toBe(0);
    });
  });

  describe('detach', () => {
    it('снимает все пять полей и убирает объект', async () => {
      const id = await newMaterial();
      await service.upload(id, PDF, 'Методичка.pdf', NOW);

      const dto = await service.detach(id, NOW);

      expect(dto).not.toHaveProperty('file');
      expect(store.objects.size).toBe(0);
      const raw = await model.findById(id).lean<Record<string, unknown>>();
      expect(raw).not.toHaveProperty('fileKey');
      expect(raw).not.toHaveProperty('fileName');
    });

    it('файла не было — 404', async () => {
      const id = await newMaterial();

      await expect(service.detach(id, NOW)).rejects.toMatchObject({ status: 404 });
    });

    it('материала нет — 404', async () => {
      await expect(
        service.detach(new Types.ObjectId().toString(), NOW),
      ).rejects.toMatchObject({ status: 404 });
    });
  });

  describe('signedUrl', () => {
    it('открытый материал — подписанная ссылка и ученику, и штату', async () => {
      const id = await newMaterial();
      await service.upload(id, PDF, 'Методичка.pdf', NOW);

      await expect(service.signedUrl(id, false, NOW)).resolves.toContain(
        'X-Amz-Signature=',
      );
      await expect(service.signedUrl(id, true, NOW)).resolves.toContain(
        'X-Amz-Signature=',
      );
    });

    // Главный инвариант слоя: право на файл — то же, что на ссылку (ADR-0048).
    it('рубильник включён: ученику 404, штату ссылка', async () => {
      const id = await newMaterial('paid');
      await service.upload(id, PDF, 'Методичка.pdf', NOW);
      await settingsService.update({ materialsPaidAccess: true });

      await expect(service.signedUrl(id, false, NOW)).rejects.toMatchObject({
        status: 404,
      });
      await expect(service.signedUrl(id, true, NOW)).resolves.toContain(
        'X-Amz-Signature=',
      );
    });

    it('файла у материала нет — 404 тем же текстом, что у закрытого', async () => {
      const id = await newMaterial();

      await expect(service.signedUrl(id, true, NOW)).rejects.toMatchObject({
        status: 404,
      });
    });

    it.each([
      ['несуществующий id', new Types.ObjectId().toString()],
      ['кривой id', 'не-id'],
    ])('%s — 404', async (_label, id) => {
      await expect(service.signedUrl(id, true, NOW)).rejects.toMatchObject({
        status: 404,
      });
    });
  });
});
