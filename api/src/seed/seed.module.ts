// Модуль сида — только сервис, без контроллера: импорт запускается CLI
// (seed-classes.ts) через createApplicationContext, а не HTTP-запросом.
import { Module } from '@nestjs/common';
import { ClassesModule } from '../classes/classes.module';
import { SeedService } from './seed.service';

@Module({
  imports: [ClassesModule],
  providers: [SeedService],
  exports: [SeedService],
})
export class SeedModule {}
