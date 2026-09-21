// Запасные пути привязки видео (ADR-0023, PLAN §11 слой 4.5): ссылка —
// владелец попытки из сессии (SECURITY §3), ручная отметка — только штат
// школы (роль на хендлере; владельца попытки берёт сервис).
//
// `remove` (ADR-0086) без `@Roles`: доступен и ученику, и штату, но правила
// разные (свою ссылку/любую запись, до `graded`/всегда) — их знает только
// сервис, роль передаётся туда из `@CurrentUser()`.
import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
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

  @Delete(':id/media/:mediaId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('id') id: string,
    @Param('mediaId') mediaId: string,
    @CurrentUser() user: UserLean,
  ): Promise<void> {
    return this.mediaAssetsService.remove(id, mediaId, user);
  }
}
