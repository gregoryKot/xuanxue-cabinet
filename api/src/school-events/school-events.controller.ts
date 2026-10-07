// CRUD событий школы (ADR-0177) — штату: учитель, помощник, админ.
// Контроллер только валидирует тело/query и зовёт сервис.
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
import type { SchoolEventDto } from '@xuanxue/shared';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import { ApiRoute } from '../common/api-route.decorator';
import type { UserLean } from '../users/users.service';
import { CreateSchoolEventDto } from './dto/create-school-event.dto';
import { ListSchoolEventsDto } from './dto/list-school-events.dto';
import { UpdateSchoolEventDto } from './dto/update-school-event.dto';
import { SchoolEventsService } from './school-events.service';

@Controller('events')
@Roles('teacher', 'assistant', 'admin')
export class SchoolEventsController {
  constructor(private readonly schoolEventsService: SchoolEventsService) {}

  @Get()
  @ApiRoute('GET /events')
  list(@Query() query: ListSchoolEventsDto): Promise<SchoolEventDto[]> {
    return this.schoolEventsService.list(query);
  }

  @Post()
  @ApiRoute('POST /events')
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body() body: CreateSchoolEventDto,
    @CurrentUser() user: UserLean,
  ): Promise<SchoolEventDto> {
    return this.schoolEventsService.create(body, user.id);
  }

  @Patch(':id')
  @ApiRoute('PATCH /events/:id')
  update(
    @Param('id') id: string,
    @Body() body: UpdateSchoolEventDto,
  ): Promise<SchoolEventDto> {
    return this.schoolEventsService.update(id, body);
  }

  @Delete(':id')
  @ApiRoute('DELETE /events/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string): Promise<void> {
    return this.schoolEventsService.remove(id);
  }
}
