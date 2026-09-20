// Модуль библиотеки материалов школы (слой 3.1, docs/PLAN.md §14, ADR-0047;
// слой 3.4 — рубильник ADR-0048; слой 3.6 — привязка к дате занятия, ADR-0056;
// слой 3.9 — материалы в архиве ученика рядом с датой, ADR-0056 «Ученик видит
// привязку там, где ищет»).
import { Module } from '@nestjs/common';
import { ClassesModule } from '../classes/classes.module';
import { SettingsModule } from '../settings/settings.module';
import { LessonMaterialsService } from './lesson-materials.service';
import { MaterialModelModule } from './material-model.module';
import { MaterialsController } from './materials.controller';
import { MaterialsService } from './materials.service';
import { MyMaterialsController } from './my-materials.controller';

@Module({
  // MaterialModelModule — модель, не второй раз forFeature (ADR-0013): тот
  // же файл нужен LessonsModule/ClassesModule для отвязки при удалении.
  // ClassesModule — ради ClassRecord: библиотека ученика подписывает материал
  // названиями занятий (`GET /me/materials`, ADR-0047), а `GET /classes` ему
  // закрыт ролью. SettingsModule — ради SettingsService: рубильник
  // `materialsPaidAccess` (ADR-0048). Цикла нет: ни ClassesModule, ни
  // SettingsModule о материалах не знают.
  imports: [MaterialModelModule, ClassesModule, SettingsModule],
  controllers: [MaterialsController, MyMaterialsController],
  providers: [MaterialsService, LessonMaterialsService],
  // LessonMaterialsService экспортирован для LessonsModule: архив ученика
  // (`GET /me/lessons/archive`) подтягивает материалы своей даты тем же
  // сервисом, что и библиотека, — второй раз ту же выборку не пишем
  // (MaterialsModule сам не зависит от LessonsModule, цикла нет).
  exports: [LessonMaterialsService],
})
export class MaterialsModule {}
