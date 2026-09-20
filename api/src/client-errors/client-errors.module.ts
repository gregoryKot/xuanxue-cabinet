// Модуль приёма отчёта браузера о сбое (ADR-0071). Импортирует
// TelegramModule только ради провайдера APP_ERROR_ALERTS
// (ClientErrorsService — @Optional(), тот же приём, что у EXAM_NOTIFIER в
// exams.module.ts). Цикла нет — TelegramModule и его собственные импорты
// про client-errors/ не знают.
import { Module } from '@nestjs/common';
import { TelegramModule } from '../telegram/telegram.module';
import { ClientErrorsController } from './client-errors.controller';
import { ClientErrorsService } from './client-errors.service';

@Module({
  imports: [TelegramModule],
  controllers: [ClientErrorsController],
  providers: [ClientErrorsService],
})
export class ClientErrorsModule {}
