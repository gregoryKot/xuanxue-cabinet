// CRUD заготовок частых комментариев при проверке (слой 4.6, PLAN §11,
// ADR-0041) — доступ штату школы, как карточка проверки
// (ExamAttemptsController.review/grade, exam-gradings.service.ts).
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
import type { GradingCommentPresetDto } from '@xuanxue/shared';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import type { UserLean } from '../users/users.service';
import { CreateGradingCommentPresetDto } from './dto/create-grading-comment-preset.dto';
import { ListGradingCommentPresetsDto } from './dto/list-grading-comment-presets.dto';
import { UpdateGradingCommentPresetDto } from './dto/update-grading-comment-preset.dto';
import { GradingPresetsService } from './grading-presets.service';

const STAFF_ONLY_ROLES = ['teacher', 'assistant', 'admin'] as const;

@Controller('grading-presets')
@Roles(...STAFF_ONLY_ROLES)
export class GradingPresetsController {
  constructor(private readonly gradingPresetsService: GradingPresetsService) {}

  @Get()
  list(@Query() query: ListGradingCommentPresetsDto): Promise<GradingCommentPresetDto[]> {
    return this.gradingPresetsService.list(query);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body() body: CreateGradingCommentPresetDto,
    @CurrentUser() user: UserLean,
  ): Promise<GradingCommentPresetDto> {
    return this.gradingPresetsService.create(body, user.id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() body: UpdateGradingCommentPresetDto,
  ): Promise<GradingCommentPresetDto> {
    return this.gradingPresetsService.update(id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string): Promise<void> {
    return this.gradingPresetsService.remove(id);
  }
}
