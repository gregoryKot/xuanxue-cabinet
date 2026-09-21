// Видео экзамена — media_assets (ADR-0023, PLAN §11 слой 4.5). Импортирует
// ExamAttemptModelModule, не ExamsModule целиком — цикл: ExamsModule сам
// импортирует этот модуль ради ExamAttemptDto.media/AttemptReviewDto.media
// (exam-attempt-media.ts). MediaAssetsService проверяет владение попыткой
// (SECURITY §3) через модель из ExamAttemptModelModule. UsersModule — имя
// ученика для подписи при пересылке видео учителю (ADR-0088,
// media-asset-send.ts); не циклит — UsersModule о MediaModule не знает.
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ExamAttemptModelModule } from '../exams/exam-attempt-model.module';
import { UsersModule } from '../users/users.module';
import { ExamMediaController } from './exam-media.controller';
import { ExamVideoDeliveryRegistry } from './exam-video-delivery.registry';
import { MediaAssetRecord, MediaAssetSchema } from './media-asset.schema';
import { MediaAssetsService } from './media-assets.service';

@Module({
  imports: [
    ExamAttemptModelModule,
    UsersModule,
    MongooseModule.forFeature([
      { name: MediaAssetRecord.name, schema: MediaAssetSchema },
    ]),
  ],
  controllers: [ExamMediaController],
  providers: [MediaAssetsService, ExamVideoDeliveryRegistry],
  // ExamVideoDeliveryRegistry — наружу: TelegramModule кладёт в него
  // TelegramExamVideoDelivery при своём подъёме (exam-video-delivery.port.ts
  // объясняет, почему инверсия, а не обычный импорт).
  exports: [MongooseModule, MediaAssetsService, ExamVideoDeliveryRegistry],
})
export class MediaModule {}
