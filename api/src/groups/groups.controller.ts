// Группы школы (ADR-0193) — доступ штату, как у занятий (данные школы,
// ADR-0010). Контроллер валидирует тело и зовёт сервис.
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
} from '@nestjs/common';
import type { GroupDto } from '@xuanxue/shared';
import { Roles } from '../auth/auth.decorators';
import { ApiRoute } from '../common/api-route.decorator';
import { GroupNameDto } from './dto/group-name.dto';
import { GroupsService } from './groups.service';

@Controller('groups')
@Roles('teacher', 'assistant', 'admin')
export class GroupsController {
  constructor(private readonly groupsService: GroupsService) {}

  @Get()
  @ApiRoute('GET /groups')
  list(): Promise<GroupDto[]> {
    return this.groupsService.list();
  }

  @Post()
  @ApiRoute('POST /groups')
  @HttpCode(HttpStatus.CREATED)
  create(@Body() body: GroupNameDto): Promise<GroupDto> {
    return this.groupsService.create(body);
  }

  @Patch(':id')
  @ApiRoute('PATCH /groups/:id')
  rename(@Param('id') id: string, @Body() body: GroupNameDto): Promise<GroupDto> {
    return this.groupsService.rename(id, body);
  }

  @Delete(':id')
  @ApiRoute('DELETE /groups/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string): Promise<void> {
    return this.groupsService.remove(id);
  }
}
