// Разовая рассылка (docs/PLAN.md §6 «Рассылки», BroadcastsController/
// BroadcastsService) + рассылка записи после «Добавить запись»
// (RecordingBroadcastService — вызывается только из LessonsService,
// lessons.service.ts). BroadcastModelModule/DeliveryModelModule — отдельные
// модели, не DeliveriesModule целиком: DeliveriesModule сам нуждается в
// BroadcastRecord (refreshBroadcastStatus, GET /deliveries/:id) — импорт
// друг друга целиком замкнул бы цикл (ADR-0013). ClassesModule/
// LessonModelModule/SettingsModule/UsersModule нужны только
// RecordingBroadcastService — ни один из них не импортирует LessonsModule
// обратно (тот же приём, что у ClassesModule ↔ LessonsModule), поэтому
// отдельный модуль под неё не понадобился.
import { Module } from '@nestjs/common';
import { ChannelsModule } from '../channels/channels.module';
import { ClassesModule } from '../classes/classes.module';
import { DeliveryModelModule } from '../deliveries/delivery-model.module';
import { LessonModelModule } from '../lessons/lesson-model.module';
import { SettingsModule } from '../settings/settings.module';
import { UsersModule } from '../users/users.module';
import { BroadcastModelModule } from './broadcast-model.module';
import { BroadcastsController } from './broadcasts.controller';
import { BroadcastsService } from './broadcasts.service';
import { RecordingBroadcastService } from './recording-broadcast.service';

@Module({
  imports: [
    BroadcastModelModule,
    DeliveryModelModule,
    ChannelsModule,
    ClassesModule,
    LessonModelModule,
    SettingsModule,
    UsersModule,
  ],
  controllers: [BroadcastsController],
  providers: [BroadcastsService, RecordingBroadcastService],
  // RecordingBroadcastService — наружу для LessonsModule; BroadcastModelModule
  // — для SchedulerModule/DeliveriesModule, как и раньше.
  exports: [BroadcastModelModule, RecordingBroadcastService],
})
export class BroadcastsModule {}
