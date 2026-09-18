// Модуль библиотеки материалов школы (слой 3.1, docs/PLAN.md §14, ADR-0047).
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ClassesModule } from '../classes/classes.module';
import { MaterialRecord, MaterialSchema } from './material.schema';
import { MaterialsController } from './materials.controller';
import { MaterialsService } from './materials.service';
import { MyMaterialsController } from './my-materials.controller';

@Module({
  // ClassesModule — ради ClassRecord: библиотека ученика подписывает материал
  // названиями занятий (`GET /me/materials`, ADR-0047), а `GET /classes` ему
  // закрыт ролью. Цикла нет: ClassesModule о материалах не знает.
  imports: [
    MongooseModule.forFeature([{ name: MaterialRecord.name, schema: MaterialSchema }]),
    ClassesModule,
  ],
  controllers: [MaterialsController, MyMaterialsController],
  providers: [MaterialsService],
})
export class MaterialsModule {}
