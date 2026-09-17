// Только регистрация модели ExamItemRecord — тот же приём, что
// ExamAttemptModelModule (ADR-0013, комментарий там же): планировщику
// (SchedulerModule, ExamImageSweepService) нужна модель вопроса банка, чтобы
// найти, на какие картинки он ссылается (`imageIds`, ADR-0035), но
// полноценный ExamsModule ему не нужен — импорт создал бы цикл через
// TelegramModule (ExamsModule сам импортирует TelegramModule ради
// EXAM_NOTIFIER, а SchedulerModule и так его импортирует напрямую — см.
// комментарий-шапку scheduler.module.ts).
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ExamItemRecord, ExamItemSchema } from './exam-item.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: ExamItemRecord.name, schema: ExamItemSchema }]),
  ],
  exports: [MongooseModule],
})
export class ExamItemModelModule {}
