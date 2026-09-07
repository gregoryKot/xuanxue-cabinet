// Рассылка записи после «Добавить запись» (RecordingBroadcastService —
// вызывается только из LessonsService, lessons.service.ts). ClassesModule/
// LessonModelModule/SettingsModule/UsersModule нужны только ей — ни один из
// них не импортирует LessonsModule обратно (тот же приём, что у ClassesModule
// ↔ LessonsModule, ADR-0013), поэтому отдельный модуль под неё не
// понадобился. DeliveriesModule — целиком: контроллера/сервиса там пока нет,
// только модель DeliveryRecord нужна для pending-доставок записи.
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ChannelsModule } from '../channels/channels.module';
import { ClassesModule } from '../classes/classes.module';
import { DeliveriesModule } from '../deliveries/deliveries.module';
import { LessonModelModule } from '../lessons/lesson-model.module';
import { SettingsModule } from '../settings/settings.module';
import { UsersModule } from '../users/users.module';
import { BroadcastRecord, BroadcastSchema } from './broadcast.schema';
import { RecordingBroadcastService } from './recording-broadcast.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: BroadcastRecord.name, schema: BroadcastSchema }]),
    DeliveriesModule,
    ChannelsModule,
    ClassesModule,
    LessonModelModule,
    SettingsModule,
    UsersModule,
  ],
  providers: [RecordingBroadcastService],
  exports: [MongooseModule, RecordingBroadcastService],
})
export class BroadcastsModule {}
