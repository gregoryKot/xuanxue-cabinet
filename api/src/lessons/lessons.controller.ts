// CRUD дат занятий — доступ только учителю/админу (данные школы, ADR-0010).
// Контроллер только валидирует тело/query и зовёт сервис: шифрование
// секретов, PATCH `null` → `$unset`, подбор длительности и title записи — в
// LessonsService (образец — ClassesController).
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
import type { LessonDto } from '@xuanxue/shared';
import { Roles } from '../auth/auth.decorators';
import { AddRecordingDto } from './dto/add-recording.dto';
import { CreateLessonDto } from './dto/create-lesson.dto';
import { ListLessonsDto } from './dto/list-lessons.dto';
import { UpdateLessonDto } from './dto/update-lesson.dto';
import { LessonsService } from './lessons.service';

@Controller('lessons')
@Roles('teacher', 'admin')
export class LessonsController {
  constructor(private readonly lessonsService: LessonsService) {}

  @Get()
  list(@Query() query: ListLessonsDto): Promise<LessonDto[]> {
    return this.lessonsService.list(query);
  }

  @Get(':id')
  getById(@Param('id') id: string): Promise<LessonDto> {
    return this.lessonsService.getById(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() body: CreateLessonDto): Promise<LessonDto> {
    return this.lessonsService.create(body);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: UpdateLessonDto): Promise<LessonDto> {
    return this.lessonsService.update(id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string): Promise<void> {
    return this.lessonsService.remove(id);
  }

  @Post(':id/recording')
  @HttpCode(HttpStatus.CREATED)
  addRecording(
    @Param('id') id: string,
    @Body() body: AddRecordingDto,
  ): Promise<LessonDto> {
    return this.lessonsService.addRecording(id, body, DateTime.utc());
  }
}
