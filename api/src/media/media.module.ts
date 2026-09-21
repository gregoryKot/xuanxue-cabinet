// Видео экзамена — media_assets (ADR-0023, PLAN §11 слой 4.5). Импортирует
// ExamAttemptModelModule, не ExamsModule целиком — цикл: ExamsModule сам
// импортирует этот модуль ради ExamAttemptDto.media/AttemptReviewDto.media
// (exam-attempt-media.ts). MediaAssetsService проверяет владение попыткой
// (SECURITY §3) через модель из ExamAttemptModelModule. UsersModule — имя
// ученика для подписи при пересылке видео учителю (ADR-0095,
// media-asset-send.ts); не циклит — UsersModule о MediaModule не знает.
//
// ExamMediaNotifierRegistry (ADR-0084, exam-media-notifier.registry.ts) —
// тот же приём инверсии, что ExamBotPortRegistry у TelegramModule: реализация
// уведомления о присланной ссылке (ExamMediaLinkNotifier) физически живёт в
// exams/, потому что media/ не может импортировать ни exams/, ни telegram/
// (TelegramModule уже импортирует этот модуль ради MediaAssetsService —
// комментарий в exam-media-notifier.port.ts). Экспортируем реестр наружу:
// ExamsModule кладёт в него реализацию при своей сборке.
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ExamAttemptModelModule } from '../exams/exam-attempt-model.module';
import { UsersModule } from '../users/users.module';
import { ExamMediaController } from './exam-media.controller';
import { ExamMediaNotifierRegistry } from './exam-media-notifier.registry';
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
  // ExamVideoDeliveryRegistry — наружу: TelegramModule кладёт в него
  // TelegramExamVideoDelivery при своём подъёме (exam-video-delivery.port.ts
  // объясняет, почему инверсия, а не обычный импорт). ExamMediaNotifierRegistry
  // — тем же способом получает реализацию от ExamsModule (комментарий выше).
  providers: [MediaAssetsService, ExamMediaNotifierRegistry, ExamVideoDeliveryRegistry],
  exports: [
    MongooseModule,
    MediaAssetsService,
    ExamMediaNotifierRegistry,
    ExamVideoDeliveryRegistry,
  ],
})
export class MediaModule {}
