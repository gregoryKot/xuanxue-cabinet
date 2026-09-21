// Модуль сида — только сервисы, без контроллера: импорт запускается CLI
// (seed-classes.ts/seed-exam.ts) через createApplicationContext, а не
// HTTP-запросом. ExamsModule даёт модели ExamRecord/ExamItemRecord (через
// свой экспорт MongooseModule) и сервисы ExamsService/ExamItemsService;
// ExamImagesModule — отдельно, ExamsModule не экспортирует его сервис
// наружу (см. комментарий-шапку exams.module.ts).
import { Module } from '@nestjs/common';
import { ClassesModule } from '../classes/classes.module';
import { ExamImagesModule } from '../exam-images/exam-images.module';
import { ExamsModule } from '../exams/exams.module';
import { SeedExamService } from './seed-exam.service';
import { SeedService } from './seed.service';

@Module({
  imports: [ClassesModule, ExamsModule, ExamImagesModule],
  providers: [SeedService, SeedExamService],
  exports: [SeedService, SeedExamService],
})
export class SeedModule {}
