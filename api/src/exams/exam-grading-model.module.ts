// Только регистрация модели ExamGradingRecord — тот же приём, что
// ExamAttemptModelModule/ExamItemModelModule (ADR-0013): AnswerVideoSweepService
// (ADR-0137) читает `gradedAt`, чтобы найти видео-ответы, чью работу
// проверили больше 90 дней назад, но полноценный ExamsModule ему не нужен —
// цикл через MediaModule/TelegramModule.
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ExamGradingRecord, ExamGradingSchema } from './exam-grading.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ExamGradingRecord.name, schema: ExamGradingSchema },
    ]),
  ],
  exports: [MongooseModule],
})
export class ExamGradingModelModule {}
