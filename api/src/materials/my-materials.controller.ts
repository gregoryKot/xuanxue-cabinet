// GET /me/materials — библиотека материалов школы глазами ученика (слой 3.1,
// docs/PLAN.md §14, ADR-0047, ADR-0048). Без @Roles: доступно любой вошедшей
// роли, включая ученика и гостя без единой роли — тот же приём, что у
// MyLessonsController (`/me/lessons`): человек смотрит общую библиотеку
// школы, а не свои данные, но маршрут всё равно требует сессии (AuthGuard),
// не публичный.
import { Controller, Get, Query } from '@nestjs/common';
import type { MyMaterialDto } from '@xuanxue/shared';
import { ListMyMaterialsDto } from './dto/list-my-materials.dto';
import { MaterialsService } from './materials.service';

@Controller('me/materials')
export class MyMaterialsController {
  constructor(private readonly materialsService: MaterialsService) {}

  @Get()
  list(@Query() query: ListMyMaterialsDto): Promise<MyMaterialDto[]> {
    return this.materialsService.listForStudent(query);
  }
}
