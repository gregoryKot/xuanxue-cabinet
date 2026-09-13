// Видео экзамена — media_assets (ADR-0023, PLAN §11 слой 4.5). Импортирует
// ExamAttemptModelModule, не ExamsModule целиком — цикл: ExamsModule сам
// импортирует этот модуль ради ExamAttemptDto.media/AttemptReviewDto.media
// (exam-attempt-media.ts). MediaAssetsService проверяет владение попыткой
// (SECURITY §3) через модель из ExamAttemptModelModule.
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ExamAttemptModelModule } from '../exams/exam-attempt-model.module';
import { ExamMediaController } from './exam-media.controller';
import { MediaAssetRecord, MediaAssetSchema } from './media-asset.schema';
import { MediaAssetsService } from './media-assets.service';

@Module({
  imports: [
    ExamAttemptModelModule,
    MongooseModule.forFeature([
      { name: MediaAssetRecord.name, schema: MediaAssetSchema },
    ]),
  ],
  controllers: [ExamMediaController],
  providers: [MediaAssetsService],
  exports: [MongooseModule, MediaAssetsService],
})
export class MediaModule {}
