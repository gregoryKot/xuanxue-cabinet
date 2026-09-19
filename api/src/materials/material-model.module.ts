// Только регистрация модели MaterialRecord, без контроллера/сервиса —
// разрывает цикл LessonsModule/ClassesModule ↔ MaterialsModule тем же
// приёмом, что LessonModelModule (ADR-0013): удаление даты занятия
// (LessonsService.remove) и занятия расписания (ClassesService.remove)
// отвязывают материалы от удалённого id (ADR-0056, ADR-0047), для этого
// нужна только модель, не CRUD библиотеки целиком — полный импорт
// MaterialsModule замкнул бы цикл через её собственный импорт ClassesModule.
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MaterialRecord, MaterialSchema } from './material.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: MaterialRecord.name, schema: MaterialSchema }]),
  ],
  exports: [MongooseModule],
})
export class MaterialModelModule {}
