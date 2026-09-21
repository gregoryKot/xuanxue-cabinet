// Модуль библиотеки материалов школы (слой 3.1, docs/PLAN.md §14, ADR-0047;
// слой 3.6 — привязка к дате занятия, ADR-0056; слой 3.9 — материалы в
// архиве ученика рядом с датой, ADR-0056 «Ученик видит привязку там, где
// ищет»; слой 3.10 — файл материала в R2, ADR-0057). Доступа по оплате нет
// (ADR-0096, отменяет ADR-0048) — SettingsModule сервисам материалов больше
// не нужен, видимость решает только роль (ADR-0058).
import { Module } from '@nestjs/common';
import { ClassesModule } from '../classes/classes.module';
import { StorageModule } from '../storage/storage.module';
import { LessonMaterialsService } from './lesson-materials.service';
import { MaterialModelModule } from './material-model.module';
import { MaterialFilesController } from './material-files.controller';
import { MaterialFilesService } from './material-files.service';
import { MaterialsController } from './materials.controller';
import { MaterialsService } from './materials.service';
import { MyMaterialsController } from './my-materials.controller';

@Module({
  // MaterialModelModule — модель, не второй раз forFeature (ADR-0013): тот
  // же файл нужен LessonsModule/ClassesModule для отвязки при удалении.
  // ClassesModule — ради ClassRecord: библиотека ученика подписывает материал
  // названиями занятий (`GET /me/materials`, ADR-0047), а `GET /classes` ему
  // закрыт ролью. Цикла нет: ClassesModule о материалах не знает.
  // StorageModule — ради FileStoreService и журнала сирот (ADR-0057,
  // ADR-0079): файл материала лежит в R2, а не у нас. Цикла нет: хранилище
  // о материалах не знает.
  imports: [MaterialModelModule, ClassesModule, StorageModule],
  controllers: [MaterialsController, MyMaterialsController, MaterialFilesController],
  providers: [MaterialsService, LessonMaterialsService, MaterialFilesService],
  // LessonMaterialsService экспортирован для LessonsModule: архив ученика
  // (`GET /me/lessons/archive`) подтягивает материалы своей даты тем же
  // сервисом, что и библиотека, — второй раз ту же выборку не пишем
  // (MaterialsModule сам не зависит от LessonsModule, цикла нет).
  exports: [LessonMaterialsService],
})
export class MaterialsModule {}
