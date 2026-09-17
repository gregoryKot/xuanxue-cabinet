// Только регистрация модели ExamAttemptRecord — тот же приём, что
// UserModelModule/ChannelModelModule (ADR-0013): MediaAssetsService проверяет
// владение попыткой (SECURITY §3), но полноценный ExamsModule ему не нужен —
// импорт создал бы цикл (ExamsModule сам импортирует MediaModule ради
// ExamAttemptDto.media/AttemptReviewDto.media, PLAN §11 слой 4.5).
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ExamAttemptRecord, ExamAttemptSchema } from './exam-attempt.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ExamAttemptRecord.name, schema: ExamAttemptSchema },
    ]),
  ],
  exports: [MongooseModule],
})
export class ExamAttemptModelModule {}
