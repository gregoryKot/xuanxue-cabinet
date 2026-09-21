import { Module } from '@nestjs/common';
import { IndexSyncService } from './index-sync.service';
import { MongoConnectionEventsService } from './mongo-connection-events.service';

// Раннер индексов поднимается сам через OnApplicationBootstrap — явно звать
// неоткуда не нужно (тот же приём, что у MigrationsModule).
// MongoConnectionEventsService — подписка на события соединения (аудит
// 2026-09-21), тоже поднимается сама через OnModuleInit.
@Module({
  providers: [IndexSyncService, MongoConnectionEventsService],
})
export class DatabaseModule {}
