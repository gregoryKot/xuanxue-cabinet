// Против настоящей Mongo (mongodb-memory-server, не мок модели — CLAUDE.md
// «Тесты»): уникальный индекс на `key` и запрос `sweep` по `createdAt`
// ловят ошибку в самом запросе, мок модели пропустил бы. `FileStoreService`
// подменяется фейком с jest.fn — своё поведение (SigV4, R2) он проверяет в
// собственном спеке. `createdAt` для «старой» записи выставляется через
// `.collection.updateOne` (сырой драйвер, мимо timestamps-плагина Mongoose —
// тот молча вырезает явный createdAt из $set), тот же приём, что в
// exam-image-sweep.service.spec.ts.
import { DateTime } from 'luxon';
import type { Connection, Model } from 'mongoose';
import { openMemoryMongo, type MemoryMongo } from '../test-support/mongo-memory';
import { StorageOrphanRecord, StorageOrphanSchema } from './storage-orphan.schema';
import { StorageOrphansService } from './storage-orphans.service';
import type { FileStoreService } from './file-store.service';

const NOW = DateTime.utc(2026, 9, 20, 12, 0, 0);

/** Фейк хранилища — jest.fn на `remove`, `isEnabled` управляемым полем.
 * Отдельная ссылка на мок в возврате, не `fileStore.remove` в expect() ниже —
 * иначе eslint (@typescript-eslint/unbound-method) ругается на метод, снятый
 * с объекта в отрыве от него (тот же приём, что в scheduler.service.spec.ts).
 * Своя логика хранилища (SigV4, сеть) — в file-store.service.spec.ts. */
function fakeFileStore(isEnabled = true): {
  fileStore: FileStoreService;
  remove: jest.Mock;
} {
  const remove = jest.fn().mockResolvedValue(undefined);
  const fileStore = { isEnabled, remove } as unknown as FileStoreService;
  return { fileStore, remove };
}

describe('StorageOrphansService', () => {
  let memory: MemoryMongo;
  let connection: Connection;
  let model: Model<StorageOrphanRecord>;

  beforeAll(async () => {
    memory = await openMemoryMongo();
    connection = memory.connection;
    model = connection.model<StorageOrphanRecord>(
      StorageOrphanRecord.name,
      StorageOrphanSchema,
    );
  }, 60_000);

  afterAll(async () => {
    await memory.stop();
  });

  afterEach(async () => {
    await model.deleteMany({});
  });

  /** Запись с явным `createdAt` — мимо timestamps-плагина, тот же приём,
   * что в exam-image-sweep.service.spec.ts. */
  async function insertWithCreatedAt(key: string, createdAt: DateTime): Promise<void> {
    await model.collection.insertOne({
      key,
      createdAt: createdAt.toJSDate(),
      updatedAt: createdAt.toJSDate(),
    });
  }

  describe('track', () => {
    it('создаёт запись', async () => {
      const { fileStore } = fakeFileStore();
      const service = new StorageOrphansService(model, fileStore);

      await service.track('materials/1/a');

      await expect(model.countDocuments({ key: 'materials/1/a' })).resolves.toBe(1);
    });

    it('повторный track того же ключа не плодит вторую запись (upsert)', async () => {
      const { fileStore } = fakeFileStore();
      const service = new StorageOrphansService(model, fileStore);

      await service.track('materials/1/a');
      await service.track('materials/1/a');

      await expect(model.countDocuments({ key: 'materials/1/a' })).resolves.toBe(1);
    });
  });

  describe('forget', () => {
    it('снимает запись', async () => {
      const { fileStore } = fakeFileStore();
      const service = new StorageOrphansService(model, fileStore);
      await service.track('materials/1/a');

      await service.forget('materials/1/a');

      await expect(model.countDocuments({ key: 'materials/1/a' })).resolves.toBe(0);
    });

    it('forget несуществующего ключа не падает', async () => {
      const { fileStore } = fakeFileStore();
      const service = new StorageOrphansService(model, fileStore);

      await expect(service.forget('нет-такого-ключа')).resolves.toBeUndefined();
    });
  });

  describe('removeNow', () => {
    it('пишет в журнал, зовёт fileStore.remove и снимает запись при успехе', async () => {
      const { fileStore, remove } = fakeFileStore();
      const service = new StorageOrphansService(model, fileStore);

      await service.removeNow('materials/1/a', NOW);

      expect(remove).toHaveBeenCalledWith('materials/1/a', NOW);
      await expect(model.countDocuments({ key: 'materials/1/a' })).resolves.toBe(0);
    });

    // Главный инвариант ADR-0079: отказ хранилища не должен ронять запрос
    // учителя (замена/удаление материала) и не должен терять ключ — его
    // доберёт sweep.
    it('при отказе хранилища не бросает и оставляет запись в журнале', async () => {
      const { fileStore, remove } = fakeFileStore();
      remove.mockRejectedValue(new Error('R2 недоступен'));
      const service = new StorageOrphansService(model, fileStore);

      await expect(service.removeNow('materials/1/a', NOW)).resolves.toBeUndefined();

      await expect(model.countDocuments({ key: 'materials/1/a' })).resolves.toBe(1);
    });
  });

  describe('sweep', () => {
    it('не трогает записи моложе суток', async () => {
      await insertWithCreatedAt('materials/1/a', NOW.minus({ hours: 23 }));
      const { fileStore, remove } = fakeFileStore();
      const service = new StorageOrphansService(model, fileStore);

      const result = await service.sweep(NOW);

      expect(result).toEqual({ removed: 0 });
      expect(remove).not.toHaveBeenCalled();
      await expect(model.countDocuments({ key: 'materials/1/a' })).resolves.toBe(1);
    });

    it('удаляет объект и снимает запись для записи старше суток', async () => {
      await insertWithCreatedAt('materials/1/a', NOW.minus({ hours: 25 }));
      const { fileStore, remove } = fakeFileStore();
      const service = new StorageOrphansService(model, fileStore);

      const result = await service.sweep(NOW);

      expect(result).toEqual({ removed: 1 });
      expect(remove).toHaveBeenCalledWith('materials/1/a', NOW);
      await expect(model.countDocuments({ key: 'materials/1/a' })).resolves.toBe(0);
    });

    it('отказ на одном ключе оставляет его запись и продолжает с остальными', async () => {
      await insertWithCreatedAt('materials/1/bad', NOW.minus({ hours: 25 }));
      await insertWithCreatedAt('materials/1/good', NOW.minus({ hours: 26 }));
      const { fileStore, remove } = fakeFileStore();
      remove.mockImplementation((key: string) =>
        key === 'materials/1/bad'
          ? Promise.reject(new Error('R2 недоступен'))
          : Promise.resolve(undefined),
      );
      const service = new StorageOrphansService(model, fileStore);

      const result = await service.sweep(NOW);

      expect(result).toEqual({ removed: 1 });
      await expect(model.countDocuments({ key: 'materials/1/bad' })).resolves.toBe(1);
      await expect(model.countDocuments({ key: 'materials/1/good' })).resolves.toBe(0);
    });

    it('при isEnabled === false не зовёт remove и возвращает { removed: 0 }', async () => {
      await insertWithCreatedAt('materials/1/a', NOW.minus({ hours: 25 }));
      const { fileStore, remove } = fakeFileStore(false);
      const service = new StorageOrphansService(model, fileStore);

      const result = await service.sweep(NOW);

      expect(result).toEqual({ removed: 0 });
      expect(remove).not.toHaveBeenCalled();
      await expect(model.countDocuments({ key: 'materials/1/a' })).resolves.toBe(1);
    });
  });
});
