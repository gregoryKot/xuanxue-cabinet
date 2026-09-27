// Объектное хранилище файлов (ADR-0057) и журнал сирот (ADR-0079) — без
// контроллера и без своих маршрутов: адресами и правами занимается тот
// домен, чьи файлы лежат в хранилище (материалы, слой 3.10 docs/PLAN.md §14).
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { FileStoreService } from './file-store.service';
import { MultipartStoreService } from './multipart-store.service';
import { StorageOrphanRecord, StorageOrphanSchema } from './storage-orphan.schema';
import { StorageOrphansService } from './storage-orphans.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: StorageOrphanRecord.name, schema: StorageOrphanSchema },
    ]),
  ],
  // MultipartStoreService (ADR-0137) — второй адаптер объектного хранилища,
  // рядом с FileStoreService: multipart-загрузка видео-ответа, не обычный
  // PUT/DELETE/подписанная ссылка.
  providers: [FileStoreService, MultipartStoreService, StorageOrphansService],
  exports: [FileStoreService, MultipartStoreService, StorageOrphansService],
})
export class StorageModule {}
