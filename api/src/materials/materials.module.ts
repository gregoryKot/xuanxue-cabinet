// Модуль библиотеки материалов школы (слой 3.1, docs/PLAN.md §14, ADR-0047).
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { MaterialRecord, MaterialSchema } from './material.schema';
import { MaterialsController } from './materials.controller';
import { MaterialsService } from './materials.service';
import { MyMaterialsController } from './my-materials.controller';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: MaterialRecord.name, schema: MaterialSchema }]),
  ],
  controllers: [MaterialsController, MyMaterialsController],
  providers: [MaterialsService],
})
export class MaterialsModule {}
