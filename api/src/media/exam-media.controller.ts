// Запасные пути привязки видео (ADR-0023, PLAN §11 слой 4.5): ссылка —
// владелец попытки из сессии (SECURITY §3), ручная отметка — только штат
// школы (роль на хендлере; владельца попытки берёт сервис).
import { Body, Controller, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { DateTime } from 'luxon';
import type { ExamMediaDto } from '@xuanxue/shared';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import type { UserLean } from '../users/users.service';
import { AddExamMediaLinkDto } from './dto/add-exam-media-link.dto';
import { AddExamMediaManualDto } from './dto/add-exam-media-manual.dto';
import { MediaAssetsService } from './media-assets.service';

const STAFF_ONLY_ROLES = ['teacher', 'assistant', 'admin'] as const;

@Controller('attempts')
export class ExamMediaController {
  constructor(private readonly mediaAssetsService: MediaAssetsService) {}

  @Post(':id/media/link')
  @HttpCode(HttpStatus.CREATED)
  addLink(
    @Param('id') id: string,
    @Body() body: AddExamMediaLinkDto,
    @CurrentUser() user: UserLean,
  ): Promise<ExamMediaDto> {
    return this.mediaAssetsService.addLink(
      id,
      user.id,
      body.url,
      DateTime.utc(),
      body.itemId,
    );
  }

  @Post(':id/media/manual')
  @HttpCode(HttpStatus.CREATED)
  @Roles(...STAFF_ONLY_ROLES)
  addManual(
    @Param('id') id: string,
    @Body() body: AddExamMediaManualDto,
  ): Promise<ExamMediaDto> {
    return this.mediaAssetsService.addManual(id, body.note, DateTime.utc(), body.itemId);
  }
}
