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
