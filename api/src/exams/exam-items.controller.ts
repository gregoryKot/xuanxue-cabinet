// CRUD банка вопросов — доступ учителю, помощнику учителя и админу (данные школы,
// ADR-0010). Контроллер только валидирует тело/query и зовёт сервис: версии,
// шифрование, проверка вариантов — в ExamItemsService.
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
import type {
  ExamItemDto,
  ExamItemStatsDto,
  ExamItemStatsSummaryDto,
} from '@xuanxue/shared';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import type { UserLean } from '../users/users.service';
import { ExamItemStatsService } from './exam-item-stats.service';
import { ExamItemsService } from './exam-items.service';
import { CreateExamItemDto } from './dto/create-exam-item.dto';
import { ListExamItemsDto } from './dto/list-exam-items.dto';
import { UpdateExamItemDto } from './dto/update-exam-item.dto';

@Controller('exam-items')
@Roles('teacher', 'assistant', 'admin')
export class ExamItemsController {
  constructor(
    private readonly examItemsService: ExamItemsService,
    private readonly examItemStatsService: ExamItemStatsService,
  ) {}

  @Get()
  list(@Query() query: ListExamItemsDto): Promise<ExamItemDto[]> {
    return this.examItemsService.list(query);
  }

  // Литеральный путь ДО `:id` (ТЗ 4.8) — иначе Nest отдаст запрос
  // `GET /exam-items/stats-summary` хендлеру `getById` с `id='stats-summary'`
  // (сегменты пути совпадают числом, порядок регистрации маршрутов решает).
  @Get('stats-summary')
  getStatsSummary(): Promise<ExamItemStatsSummaryDto> {
    return this.examItemStatsService.getSummary();
  }

  @Get(':id')
  getById(@Param('id') id: string): Promise<ExamItemDto> {
    return this.examItemsService.getById(id);
  }

  @Get(':id/stats')
  getStats(@Param('id') id: string): Promise<ExamItemStatsDto> {
    return this.examItemStatsService.getStats(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body() body: CreateExamItemDto,
    @CurrentUser() user: UserLean,
  ): Promise<ExamItemDto> {
    return this.examItemsService.create(body, user.id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateExamItemDto): Promise<ExamItemDto> {
    return this.examItemsService.update(id, body, DateTime.utc());
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string): Promise<void> {
    return this.examItemsService.remove(id);
  }
}
