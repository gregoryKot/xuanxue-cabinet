// Запись занятия файлом (ADR-0180). LessonModelModule — только модель занятий
// (доступ и уборщик смотрят, на что ссылаются записи), не LessonsModule целиком:
// LessonsModule сам импортирует этот модуль ради проверки `videoId` при добавлении
// записи (LessonsService.addRecording), полный импорт замкнул бы цикл — тот же
// приём, что у ExamVideosModule. StorageModule — ради FileStoreService/
// StorageOrphansService (ADR-0057/ADR-0079).
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { LessonModelModule } from '../lessons/lesson-model.module';
import { StorageModule } from '../storage/storage.module';
import { VideoUploadsModule } from '../video-uploads/video-uploads.module';
import { LessonVideoSweepService } from './lesson-video-sweep.service';
import { LessonVideoUploadsService } from './lesson-video-uploads.service';
import { LessonVideoRecord, LessonVideoSchema } from './lesson-video.schema';
import { LessonVideosController } from './lesson-videos.controller';
import { LessonVideosService } from './lesson-videos.service';

@Module({
  imports: [
    LessonModelModule,
    StorageModule,
    VideoUploadsModule,
    MongooseModule.forFeature([
      { name: LessonVideoRecord.name, schema: LessonVideoSchema },
    ]),
  ],
  controllers: [LessonVideosController],
  providers: [LessonVideosService, LessonVideoUploadsService, LessonVideoSweepService],
  exports: [MongooseModule, LessonVideosService, LessonVideoSweepService],
})
export class LessonVideosModule {}
