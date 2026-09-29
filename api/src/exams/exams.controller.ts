// CRUD формы экзамена — доступ учителю, помощнику учителя и админу (данные школы,
// ADR-0010). Контроллер только валидирует тело/query и зовёт сервис:
// шифрование и правила ТЗ 4.3 (блоки, публикация, удаление) — в ExamsService.
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
import type { BulkDeleteResult, ExamDto } from '@xuanxue/shared';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import type { UserLean } from '../users/users.service';
import { BulkDeleteDto } from '../common/bulk-delete.dto';
import { bulkRemove } from '../common/bulk-remove';
import { ExamsService } from './exams.service';
import { CreateExamDto } from './dto/create-exam.dto';
import { ListExamsDto } from './dto/list-exams.dto';
import { UpdateExamDto } from './dto/update-exam.dto';
import { ApiRoute } from '../common/api-route.decorator';

@Controller('exams')
@Roles('teacher', 'assistant', 'admin')
export class ExamsController {
  constructor(private readonly examsService: ExamsService) {}

  @Get()
  @ApiRoute('GET /exams')
  list(@Query() query: ListExamsDto): Promise<ExamDto[]> {
    return this.examsService.list(query);
  }

  @Get(':id')
  @ApiRoute('GET /exams/:id')
  getById(@Param('id') id: string): Promise<ExamDto> {
    return this.examsService.getById(id);
  }

  @Post()
  @ApiRoute('POST /exams')
  @HttpCode(HttpStatus.CREATED)
  create(@Body() body: CreateExamDto, @CurrentUser() user: UserLean): Promise<ExamDto> {
    return this.examsService.create(body, user.id);
  }

  @Patch(':id')
  @ApiRoute('PATCH /exams/:id')
  update(@Param('id') id: string, @Body() body: UpdateExamDto): Promise<ExamDto> {
    return this.examsService.update(id, body);
  }

  @Delete(':id')
  @ApiRoute('DELETE /exams/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string): Promise<void> {
    return this.examsService.remove(id, DateTime.utc());
  }

  // Логика массового удаления — в bulkRemove (common/bulk-remove.ts, тесты
  // там же без Mongo и без HTTP): ExamsService уже на потолке файлового
  // храповика (CLAUDE.md «Храповики»), а тут и добавлять нечего — контроллер
  // просто зовёт тот же remove(), что и одиночный DELETE.
  @Post('bulk-delete')
  @ApiRoute('POST /exams/bulk-delete')
  @HttpCode(HttpStatus.OK)
  removeMany(@Body() body: BulkDeleteDto): Promise<BulkDeleteResult> {
    // Одно «сейчас» на весь запрос — у всех записей выборки одна отметка deletedAt.
    const now = DateTime.utc();
    return bulkRemove(body.ids, (id) => this.examsService.remove(id, now));
  }
}
