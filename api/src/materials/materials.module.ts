// Модуль библиотеки материалов школы (слой 3.1, docs/PLAN.md §14, ADR-0047;
// слой 3.4 — рубильник ADR-0048; слой 3.6 — привязка к дате занятия, ADR-0056).
import { Module } from '@nestjs/common';
import { ClassesModule } from '../classes/classes.module';
import { SettingsModule } from '../settings/settings.module';
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
  providers: [MaterialsService],
})
export class MaterialsModule {}
