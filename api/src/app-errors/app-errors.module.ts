// Журнал сбоев (ADR-0132). Экспортирует APP_ERROR_JOURNAL — AppModule
// провайдит DomainExceptionFilter напрямую и импортирует этот модуль, чтобы
// фильтр получил токен через `@Optional()` (тот же приём, что APP_ERROR_ALERTS
// в telegram.module.ts); ClientErrorsModule импортирует его же ради того же
// токена в ClientErrorsService.
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { APP_ERROR_JOURNAL } from '../common/app-error-journal';
import { AppErrorSchema, AppErrorRecord } from './app-error.schema';
import { AppErrorsService } from './app-errors.service';
import { DevErrorsController } from './dev-errors.controller';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: AppErrorRecord.name, schema: AppErrorSchema }]),
  ],
  controllers: [DevErrorsController],
  providers: [
    AppErrorsService,
    { provide: APP_ERROR_JOURNAL, useExisting: AppErrorsService },
  ],
  exports: [APP_ERROR_JOURNAL],
})
export class AppErrorsModule {}
