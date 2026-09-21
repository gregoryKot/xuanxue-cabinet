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

  // Оставлена ExamMediaDto — рассмотрена и НЕ переведена на AttemptReviewDto
  // при исполнении ADR-0087 (2026-09): экран проверки кладёт этот ответ на
  // себя через явный reload() GET /attempts/:id/review, что ADR-0087 разрешает
  // («либо DTO, либо вызывающий осознанно перечитывает»). Собрать
  // AttemptReviewDto здесь напрямую нельзя без нового цикла в графе Nest:
  // ExamGradingsService.getReview() (нужен для AttemptReviewDto) — провайдер
  // ExamsModule, а ExamsModule уже импортирует MediaModule (ради
  // MediaAssetsService, exams.module.ts) — обратный импорт закольцевал бы
  // граф (ADR-0013, forwardRef в проекте не используется). Решение, если
  // понадобится: query-порт по образцу ExamMediaNotifierRegistry
  // (exam-media-notifier.port.ts/registry.ts) — тем же приёмом инверсии,
  // только для чтения, а не уведомления, с реализацией в exams/.
  @Post(':id/media/manual')
  @HttpCode(HttpStatus.CREATED)
  @Roles(...STAFF_ONLY_ROLES)
  addManual(
    @Param('id') id: string,
    @Body() body: AddExamMediaManualDto,
  ): Promise<ExamMediaDto> {
    return this.mediaAssetsService.addManual(id, body.note, DateTime.utc(), body.itemId);
  }

  // ADR-0095: пересылка учителю в момент получения могла не дойти — эта
  // кнопка достаёт то же видео заново. Чат — из сессии вызывающего
  // (SECURITY §3), не из тела запроса, поэтому тела у маршрута нет.
  @Post(':id/media/:mediaId/send-to-me')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(...STAFF_ONLY_ROLES)
  sendToMe(
    @Param('id') id: string,
    @Param('mediaId') mediaId: string,
    @CurrentUser() user: UserLean,
  ): Promise<void> {
    return this.mediaAssetsService.sendToChat(id, mediaId, user.id);
  }
}
