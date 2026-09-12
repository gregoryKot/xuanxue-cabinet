// CRUD формы экзамена — доступ только учителю/админу (данные школы,
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
import type { ExamDto } from '@xuanxue/shared';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import type { UserLean } from '../users/users.service';
import { ExamsService } from './exams.service';
import { CreateExamDto } from './dto/create-exam.dto';
import { ListExamsDto } from './dto/list-exams.dto';
import { UpdateExamDto } from './dto/update-exam.dto';

@Controller('exams')
@Roles('teacher', 'admin')
export class ExamsController {
  constructor(private readonly examsService: ExamsService) {}

  @Get()
  list(@Query() query: ListExamsDto): Promise<ExamDto[]> {
    return this.examsService.list(query);
  }

  @Get(':id')
  getById(@Param('id') id: string): Promise<ExamDto> {
    return this.examsService.getById(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() body: CreateExamDto, @CurrentUser() user: UserLean): Promise<ExamDto> {
    return this.examsService.create(body, user.id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateExamDto): Promise<ExamDto> {
    return this.examsService.update(id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string): Promise<void> {
    return this.examsService.remove(id);
  }
}
