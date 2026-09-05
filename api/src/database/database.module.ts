import { Module } from '@nestjs/common';
import { IndexSyncService } from './index-sync.service';

// Раннер индексов поднимается сам через OnApplicationBootstrap — явно звать
// неоткуда не нужно (тот же приём, что у MigrationsModule).
@Module({
  providers: [IndexSyncService],
  exports: [IndexSyncService],
})
export class DatabaseModule {}
