// CRUD библиотеки материалов школы (слой 3.1, docs/PLAN.md §14, ADR-0047) —
// доступ штату школы, как у заготовок комментариев
// (GradingPresetsController). Контроллер только валидирует тело/query и
// зовёт сервис.
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { DateTime } from 'luxon';
import type { MaterialDto } from '@xuanxue/shared';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import type { UserLean } from '../users/users.service';
import { CreateMaterialDto } from './dto/create-material.dto';
import { ListMaterialsDto } from './dto/list-materials.dto';
import { UpdateMaterialDto } from './dto/update-material.dto';
import { MaterialsService } from './materials.service';

const STAFF_ONLY_ROLES = ['teacher', 'assistant', 'admin'] as const;

@Controller('materials')
@Roles(...STAFF_ONLY_ROLES)
export class MaterialsController {
  constructor(private readonly materialsService: MaterialsService) {}

  @Get()
  list(@Query() query: ListMaterialsDto): Promise<MaterialDto[]> {
    return this.materialsService.list(query);
  }

  // Инцидент 2026-09-27: страница-редактор материала (useMaterialEditor.ts)
  // открывалась по прямой ссылке /materials/:id, а маршрута на чтение одной
  // записи у контроллера не было (был только у соседних коллекций — classes,
  // channels, exams, exam-items, lessons) — Nest отвечал «Cannot GET
  // /api/materials/:id». Веб-тесты мокают apiFetch и дыру не видели;
  // check-editor-routes.mjs теперь сверяет это на CI.
  @Get(':id')
  getById(@Param('id') id: string): Promise<MaterialDto> {
    return this.materialsService.getById(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body() body: CreateMaterialDto,
    @CurrentUser() user: UserLean,
  ): Promise<MaterialDto> {
    return this.materialsService.create(body, user.id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateMaterialDto): Promise<MaterialDto> {
    return this.materialsService.update(id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string): Promise<void> {
    return this.materialsService.remove(id, DateTime.utc());
  }
}
