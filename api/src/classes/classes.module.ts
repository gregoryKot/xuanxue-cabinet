import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { LessonModelModule } from '../lessons/lesson-model.module';
import { ClassRecord, ClassSchema } from './class.schema';
import { ClassesController } from './classes.controller';
import { ClassesService } from './classes.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: ClassRecord.name, schema: ClassSchema }]),
    // remove() проверяет lessons.exists({ classId }) — только модель,
    // не весь LessonsModule (его контроллер/сервис здесь не нужны, а полный
    // импорт замкнул бы цикл: LessonsModule сам зависит от ClassesModule
    // ради модели ClassRecord, см. lesson-model.module.ts).
    LessonModelModule,
  ],
  controllers: [ClassesController],
  providers: [ClassesService],
  // ClassesService экспортирован для SeedModule (PR H): импорт занятий из
  // сида переиспользует create() — там же шифрование zoomLink/zoomPassword,
  // дублировать его в семинге нельзя (CLAUDE.md «Одна механика»).
  exports: [MongooseModule, ClassesService],
})
export class ClassesModule {}
