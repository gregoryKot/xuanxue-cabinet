import { Module } from '@nestjs/common';
import { MigrationRunner } from './migration.runner';
import { DatabaseModule } from '../database/database.module';

// Регистрирует раннер миграций как провайдер — он сам поднимается через
// OnApplicationBootstrap (см. migration.runner.ts), явно звать неоткуда не нужно.
// Импорт DatabaseModule — не про DI, а про порядок бутстрапа: Nest вызывает
// OnApplicationBootstrap по убыванию «глубины» модуля в графе, а у двух
// прямых импортов AppModule она одинакова (порядок в массиве imports это не
// гарантирует). Явная зависимость делает DatabaseModule глубже — его индексы
// строятся раньше миграций, которые могут на них рассчитывать.
@Module({
  imports: [DatabaseModule],
  providers: [MigrationRunner],
  exports: [MigrationRunner],
})
export class MigrationsModule {}
