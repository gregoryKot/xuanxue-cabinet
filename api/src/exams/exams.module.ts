// Один модуль на банк вопросов (`exam_items`) и форму экзамена (`exams`,
// ТЗ 4.3): форма ссылается на вопросы того же банка (ExamsService зовёт
// ExamItemModel — проверка «блок ссылается на опубликованный вопрос»,
// exams.service.ts), поэтому им всё равно нужен общий контекст DI; заводить
// отдельный ExamItemsModule ради разделения добавило бы только ре-экспорт
// MongooseModule без другой пользы (CLAUDE.md «Файлы»: не создавай без нужды).
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
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
    ]),
  ],
  controllers: [ExamItemsController, ExamsController],
  providers: [ExamItemsService, ExamsService],
  exports: [MongooseModule, ExamItemsService, ExamsService],
})
export class ExamsModule {}
