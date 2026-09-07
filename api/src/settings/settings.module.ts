// SettingsController — GET/PATCH /settings, POST /settings/preview
// (docs/PLAN.md §6 «Шаблоны»). ClassesModule/LessonModelModule/UsersModule —
// только ради preview (settings-preview.ts зовёт тот же рендер, что и
// планировщик): цикла с BroadcastsModule нет, оно само импортирует
// SettingsModule ради шаблонов, а не наоборот (ADR-0013, тот же приём, что
// у LessonsModule ↔ BroadcastsModule).
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ClassesModule } from '../classes/classes.module';
import { LessonModelModule } from '../lessons/lesson-model.module';
import { UsersModule } from '../users/users.module';
import { SettingsController } from './settings.controller';
import { SettingsRecord, SettingsSchema } from './settings.schema';
import { SettingsService } from './settings.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: SettingsRecord.name, schema: SettingsSchema }]),
    ClassesModule,
    LessonModelModule,
    UsersModule,
  ],
  controllers: [SettingsController],
  providers: [SettingsService],
  exports: [MongooseModule, SettingsService],
})
export class SettingsModule {}
