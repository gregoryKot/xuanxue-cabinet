// Объектное хранилище файлов (ADR-0057) и журнал сирот (ADR-0078) — без
// контроллера и без своих маршрутов: адресами и правами занимается тот
// домен, чьи файлы лежат в хранилище (материалы, слой 3.10 docs/PLAN.md §14).
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { FileStoreService } from './file-store.service';
import { StorageOrphanRecord, StorageOrphanSchema } from './storage-orphan.schema';
import { StorageOrphansService } from './storage-orphans.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: StorageOrphanRecord.name, schema: StorageOrphanSchema },
    ]),
  ],
  providers: [FileStoreService, StorageOrphansService],
  exports: [FileStoreService, StorageOrphansService],
})
export class StorageModule {}
