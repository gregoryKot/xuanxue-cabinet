// Видео-ответ ученика (ADR-0137). ExamAttemptModelModule — модель попытки
// (владение, снимок вопросов), не ExamsModule целиком — цикл, тот же приём,
// что ExamVideosModule/MediaModule. MediaModule — MediaAssetRecord и
// ExamMediaNotifierRegistry: AnswerVideosModule зависит от media/, но не
// наоборот — MediaModule про этот модуль не знает, цикла нет. StorageModule
// — FileStoreService/MultipartStoreService/StorageOrphansService.
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ExamAttemptModelModule } from '../exams/exam-attempt-model.module';
import { ExamGradingModelModule } from '../exams/exam-grading-model.module';
import { MediaModule } from '../media/media.module';
import { StorageModule } from '../storage/storage.module';
import { AnswerVideoAssembleService } from './answer-video-assemble';
import { AnswerVideoCompleteService } from './answer-video-complete';
import { AnswerVideoPartService } from './answer-video-part';
import { AnswerVideoStartController } from './answer-video-start.controller';
import { AnswerVideoStartService } from './answer-video-start';
import { AnswerVideoStatsService } from './answer-video-stats.service';
import { AnswerVideoSweepService } from './answer-video-sweep.service';
import { AnswerVideoRecord, AnswerVideoSchema } from './answer-video.schema';
import { AnswerVideosController } from './answer-videos.controller';
import { AnswerVideosService } from './answer-videos.service';

@Module({
  imports: [
    ExamAttemptModelModule,
    // ExamGradingModelModule — только модель, ради AnswerVideoSweepService
    // (срок «90 дней после проверки»), не весь ExamsModule (цикл).
    ExamGradingModelModule,
    MediaModule,
    StorageModule,
    MongooseModule.forFeature([
      { name: AnswerVideoRecord.name, schema: AnswerVideoSchema },
    ]),
  ],
  controllers: [AnswerVideoStartController, AnswerVideosController],
  providers: [
    AnswerVideoStartService,
    AnswerVideoPartService,
    AnswerVideoAssembleService,
    AnswerVideoCompleteService,
    AnswerVideosService,
    AnswerVideoStatsService,
    AnswerVideoSweepService,
  ],
  exports: [MongooseModule, AnswerVideoStatsService, AnswerVideoSweepService],
})
export class AnswerVideosModule {}
