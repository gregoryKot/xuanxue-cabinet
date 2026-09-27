// Хранилище видео вопроса/варианта (ADR-0133). Импортирует
// ExamAttemptModelModule, не ExamsModule целиком — цикл, тот же приём, что
// ExamImagesModule: в следующем слое ExamsModule сам импортирует этот модуль
// ради проверки существования видео у вопроса/варианта. StorageModule — ради
// FileStoreService/StorageOrphansService (ADR-0057/ADR-0079), тот же приём,
// что MaterialsModule.
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ExamAttemptModelModule } from '../exams/exam-attempt-model.module';
import { StorageModule } from '../storage/storage.module';
import { ExamVideoStatsService } from './exam-video-stats.service';
import { ExamVideoRecord, ExamVideoSchema } from './exam-video.schema';
import { ExamVideosController } from './exam-videos.controller';
import { ExamVideosService } from './exam-videos.service';

@Module({
  imports: [
    ExamAttemptModelModule,
    StorageModule,
    MongooseModule.forFeature([{ name: ExamVideoRecord.name, schema: ExamVideoSchema }]),
  ],
  controllers: [ExamVideosController],
  providers: [ExamVideosService, ExamVideoStatsService],
  exports: [MongooseModule, ExamVideosService],
})
export class ExamVideosModule {}
