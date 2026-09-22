// До HealthPingService (ADR-0112) у области health не было провайдеров —
// HealthController жил прямо в AppModule.controllers. Свой модуль появился
// вместе с первым провайдером области: контроллер и HealthPingService
// собраны здесь.
//
// SchedulerModule импортируется тем же приёмом, что и в других местах
// (scheduler.module.ts, шапка файла): токен SCHEDULER_HEARTBEAT нужен обоим
// потребителям через @Optional(), а импорт всего SchedulerModule ради одного
// экспортируемого токена не создаёт второй экземпляр (useExisting) и не
// заводит цикл — SchedulerModule про HealthModule не знает.
import { Module } from '@nestjs/common';
import { SchedulerModule } from '../scheduler/scheduler.module';
import { HealthController } from './health.controller';
import { HealthPingService } from './health-ping.service';

@Module({
  imports: [SchedulerModule],
  controllers: [HealthController],
  providers: [HealthPingService],
})
export class HealthModule {}
