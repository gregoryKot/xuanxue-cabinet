import { Module } from '@nestjs/common';
import { MigrationRunner } from './migration.runner';

// Регистрирует раннер миграций как провайдер — он сам поднимается через
// OnApplicationBootstrap (см. migration.runner.ts), явно звать неоткуда не нужно.
@Module({
  providers: [MigrationRunner],
  exports: [MigrationRunner],
})
export class MigrationsModule {}
