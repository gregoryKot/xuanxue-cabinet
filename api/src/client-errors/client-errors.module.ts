// Модуль приёма отчёта браузера о сбое (ADR-0071). Импортирует
// TelegramModule только ради провайдера APP_ERROR_ALERTS
// (ClientErrorsService — @Optional(), тот же приём, что у EXAM_NOTIFIER в
// exams.module.ts) и AppErrorsModule ради APP_ERROR_JOURNAL (ADR-0132, тот
// же приём). Цикла нет — ни один из них не импортирует client-errors/ обратно.
import { Module } from '@nestjs/common';
import { AppErrorsModule } from '../app-errors/app-errors.module';
import { TelegramModule } from '../telegram/telegram.module';
import { ClientErrorsController } from './client-errors.controller';
import { ClientErrorsService } from './client-errors.service';

@Module({
  imports: [TelegramModule, AppErrorsModule],
  controllers: [ClientErrorsController],
  providers: [ClientErrorsService],
})
export class ClientErrorsModule {}
