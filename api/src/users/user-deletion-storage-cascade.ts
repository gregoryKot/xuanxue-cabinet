// Байты в стороннем хранилище (R2) при удалении аккаунта (ADR-0137) —
// вынесено из UserDeletionService (файл-лимит CLAUDE.md «Храповики»).
// USER_OWNED_CASCADES удаляет документы Mongo по id, но объект в R2 —
// не документ; для каждой модели из USER_OWNED_STORAGE_CASCADES читаем
// ключ (и, если есть, uploadId незаконченной multipart-загрузки) ДО того,
// как вызывающий удалит сами документы владения (`deleteMany` по userId).
import { Logger } from '@nestjs/common';
import type { Connection } from 'mongoose';
import type { DateTime } from 'luxon';
import { errorMessage } from '../common/error-info';
import type { MultipartStoreService } from '../storage/multipart-store.service';
import type { StorageOrphansService } from '../storage/storage-orphans.service';
import { USER_OWNED_STORAGE_CASCADES } from './user-data.registry';

type GenericRecord = Record<string, unknown>;

const logger = new Logger('user-deletion-storage-cascade');

export async function removeUserOwnedStorage(
  connection: Connection,
  multipart: MultipartStoreService,
  orphans: StorageOrphansService,
  userId: string,
  now: DateTime,
): Promise<void> {
  for (const { model, keyPath, uploadIdPath } of USER_OWNED_STORAGE_CASCADES) {
    const docs = await connection
      .model<GenericRecord>(model)
      .find({ userId }, { [keyPath]: 1, [uploadIdPath]: 1 })
      .lean<Record<string, unknown>[]>();
    for (const doc of docs) {
      const key = doc[keyPath];
      const uploadId = doc[uploadIdPath];
      if (typeof key !== 'string') continue;
      if (typeof uploadId === 'string') {
        try {
          await multipart.abortMultipartUpload(key, uploadId, now);
        } catch (err) {
          logger.warn(
            `не удалось прервать multipart-загрузку при удалении аккаунта: ${errorMessage(err)}`,
          );
        }
      }
      await orphans.removeNow(key, now);
    }
  }
}
