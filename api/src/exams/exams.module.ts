// Один модуль на банк вопросов (`exam_items`), форму экзамена (`exams`, ТЗ
// 4.3) и попытку (`exam_attempts`, ТЗ 4.4): попытка при старте читает форму
// и вопросы через ExamsService/ExamItemsService того же модуля (проверка
// «блок ссылается на опубликованный вопрос», расшифровка снимка) — им всё
// равно нужен общий контекст DI; заводить отдельный модуль ради разделения
// добавило бы только ре-экспорт MongooseModule без другой пользы (CLAUDE.md
// «Файлы»: не создавай без нужды).
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ExamAttemptRecord, ExamAttemptSchema } from './exam-attempt.schema';
import { ExamAttemptsController } from './exam-attempts.controller';
import { ExamAttemptsService } from './exam-attempts.service';
import { ExamItemRecord, ExamItemSchema } from './exam-item.schema';
import { ExamItemsController } from './exam-items.controller';
import { ExamItemsService } from './exam-items.service';
import { ExamRecord, ExamSchema } from './exam.schema';
import { ExamsController } from './exams.controller';
import { ExamsService } from './exams.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ExamItemRecord.name, schema: ExamItemSchema },
      { name: ExamRecord.name, schema: ExamSchema },
      { name: ExamAttemptRecord.name, schema: ExamAttemptSchema },
    ]),
  ],
  controllers: [ExamItemsController, ExamsController, ExamAttemptsController],
  providers: [ExamItemsService, ExamsService, ExamAttemptsService],
  exports: [MongooseModule, ExamItemsService, ExamsService, ExamAttemptsService],
})
export class ExamsModule {}
