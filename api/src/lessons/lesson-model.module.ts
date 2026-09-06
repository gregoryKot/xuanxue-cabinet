// Только регистрация модели LessonRecord, без контроллера/сервиса —
// разрывает цикл ClassesModule ↔ LessonsModule: ClassesService нужен
// LessonRecord (remove() проверяет lessons.exists), LessonsService нужен
// ClassRecord (create()/list() проверяют класс) — если бы оба модуля
// импортировали друг друга целиком, Nest не смог бы разрешить граф. Модель
// регистрируется один раз (CLAUDE.md «Файлы»), оба домена берут её отсюда.
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { LessonRecord, LessonSchema } from './lesson.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: LessonRecord.name, schema: LessonSchema }]),
  ],
  exports: [MongooseModule],
})
export class LessonModelModule {}
