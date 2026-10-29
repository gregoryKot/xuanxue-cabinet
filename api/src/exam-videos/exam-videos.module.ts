// Хранилище видео вопроса/варианта (ADR-0133). Импортирует
// ExamAttemptModelModule, не ExamsModule целиком — цикл, тот же приём, что
// ExamImagesModule: в следующем слое ExamsModule сам импортирует этот модуль
// ради проверки существования видео у вопроса/варианта. StorageModule — ради
// FileStoreService/StorageOrphansService (ADR-0057/ADR-0079), тот же приём,
// что MaterialsModule.
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ExamAttemptModelModule } from '../exams/exam-attempt-model.module';
import { ExamItemModelModule } from '../exams/exam-item-model.module';
import { StorageModule } from '../storage/storage.module';
import { VideoUploadsModule } from '../video-uploads/video-uploads.module';
import { ExamVideoStatsService } from './exam-video-stats.service';
import { ExamVideoTranscodeController } from './exam-video-transcode.controller';
import { ExamVideoTranscodeService } from './exam-video-transcode.service';
import { ExamVideoUploadsService } from './exam-video-uploads.service';
import { ExamVideoRecord, ExamVideoSchema } from './exam-video.schema';
import { ExamVideosController } from './exam-videos.controller';
import { ExamVideosService } from './exam-videos.service';

@Module({
  imports: [
    ExamAttemptModelModule,
    // Только модель вопроса банка — ради сверки ссылок на видео при замене файла
    // (ADR-0189), как у планировщика; ExamsModule целиком дал бы цикл.
    ExamItemModelModule,
    StorageModule,
    VideoUploadsModule,
    MongooseModule.forFeature([{ name: ExamVideoRecord.name, schema: ExamVideoSchema }]),
  ],
  // Порядок важен: ExamVideoTranscodeController с литеральным `codec-pending` — до
  // ExamVideosController с его `GET :id` (комментарий в контроллере).
  controllers: [ExamVideoTranscodeController, ExamVideosController],
  providers: [
    ExamVideosService,
    ExamVideoStatsService,
    ExamVideoUploadsService,
    ExamVideoTranscodeService,
  ],
  exports: [MongooseModule, ExamVideosService],
})
export class ExamVideosModule {}
