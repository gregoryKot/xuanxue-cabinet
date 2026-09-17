// Хранилище картинок вариантов ответа (ADR-0035, PLAN §11 слой 4.2).
// Импортирует ExamAttemptModelModule, не ExamsModule целиком — цикл: в
// следующем слое ExamsModule сам импортирует этот модуль ради проверки
// существования картинки у варианта (тот же приём, что MediaModule,
// media/media.module.ts).
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ExamAttemptModelModule } from '../exams/exam-attempt-model.module';
import { ExamImageStatsService } from './exam-image-stats.service';
import { ExamImageRecord, ExamImageSchema } from './exam-image.schema';
import { ExamImagesController } from './exam-images.controller';
import { ExamImagesService } from './exam-images.service';

@Module({
  imports: [
    ExamAttemptModelModule,
    MongooseModule.forFeature([{ name: ExamImageRecord.name, schema: ExamImageSchema }]),
  ],
  controllers: [ExamImagesController],
  providers: [ExamImagesService, ExamImageStatsService],
  exports: [MongooseModule, ExamImagesService],
})
export class ExamImagesModule {}
