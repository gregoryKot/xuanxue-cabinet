// Видео экзамена — media_assets (ADR-0023, PLAN §11 слой 4.5). Импортирует
// ExamAttemptModelModule, не ExamsModule целиком — цикл: ExamsModule сам
// импортирует этот модуль ради ExamAttemptDto.media/AttemptReviewDto.media
// (exam-attempt-media.ts). MediaAssetsService проверяет владение попыткой
// (SECURITY §3) через модель из ExamAttemptModelModule.
//
// ExamMediaNotifierRegistry (ADR-0084) — наружу: TelegramModule уже
// импортирует MediaModule (ExamMediaMessageHandler, тот же слой 4.5),
// обратный импорт закольцевал бы граф, поэтому порт и реестр уведомления о
// привязанной ссылке живут здесь, а реализация (TelegramExamMediaNotifier,
// api/src/telegram/) кладёт себя в реестр сама — комментарий в
// exam-media-notifier.port.ts.
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ExamAttemptModelModule } from '../exams/exam-attempt-model.module';
import { ExamMediaNotifierRegistry } from './exam-media-notifier.port';
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
  providers: [MediaAssetsService, ExamMediaNotifierRegistry],
  exports: [MongooseModule, MediaAssetsService, ExamMediaNotifierRegistry],
})
export class MediaModule {}
