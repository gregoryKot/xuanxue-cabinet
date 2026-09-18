// CRUD дат занятий — доступ учителю, помощнику учителя и админу (данные школы, ADR-0010).
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
import type { BroadcastDto, LessonDto } from '@xuanxue/shared';
import { Roles } from '../auth/auth.decorators';
import { SendNowService } from '../broadcasts/send-now.service';
import { AddRecordingDto } from './dto/add-recording.dto';
import { CreateLessonDto } from './dto/create-lesson.dto';
import { ListLessonsDto } from './dto/list-lessons.dto';
import { UpdateLessonDto } from './dto/update-lesson.dto';
import { LessonsService } from './lessons.service';

@Controller('lessons')
@Roles('teacher', 'assistant', 'admin')
export class LessonsController {
  constructor(
    private readonly lessonsService: LessonsService,
    private readonly sendNowService: SendNowService,
  ) {}

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
    return this.lessonsService.update(id, body, DateTime.utc());
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

  // Аудит В12: PLAN §6 обещал POST /classes/:id/send-now, действие относится
  // к дате занятия, не к слоту — маршрут на /lessons (docs/PLAN.md §6 «API»).
  @Post(':id/send-now')
  @HttpCode(HttpStatus.OK)
  sendNow(@Param('id') id: string): Promise<BroadcastDto> {
    return this.sendNowService.sendNow(id, DateTime.utc());
  }
}
