// Загрузка и раздача видео вопроса/варианта (ADR-0133). POST принимает
// сырое тело (exam-video-body.ts/app.setup.ts), только штат школы; GET —
// без @Roles: ученику видео нужно на экране сдачи, доступ решает сервис по
// снимку его попытки (ExamVideosService.signedUrl, SECURITY §3), хендлер —
// VideoRedirectController.get (common/video-redirect.ts, доля с
// AnswerVideosController). В отличие от картинок (StreamableFile из Mongo)
// здесь редирект на подписанную ссылку R2 — байты идут мимо нашего
// инстанса (ADR-0057).
import { Controller, Get, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { DateTime } from 'luxon';
import type { ExamVideoDto, ExamVideoStatsDto } from '@xuanxue/shared';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import { ApiRoute } from '../common/api-route.decorator';
import { VideoRedirectController } from '../common/video-redirect';
import type { UserLean } from '../users/users.service';
import { ExamVideoStatsService } from './exam-video-stats.service';
import { ExamVideosService } from './exam-videos.service';

interface RawBodyRequest {
  body?: unknown;
}

@Controller('exam-videos')
export class ExamVideosController extends VideoRedirectController<UserLean> {
  constructor(
    private readonly service: ExamVideosService,
    private readonly statsService: ExamVideoStatsService,
  ) {
    super();
  }

  protected signedUrl(id: string, user: UserLean, now: DateTime): Promise<string> {
    return this.service.signedUrl(id, user, now);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles('teacher', 'assistant', 'admin')
  upload(
    @Req() req: RawBodyRequest,
    @CurrentUser() user: UserLean,
  ): Promise<ExamVideoDto> {
    return this.service.upload(req.body, user.id, DateTime.utc());
  }

  // Литеральный путь ДО `:id` (тот же приём, что ExamImagesController) —
  // иначе Nest отдаст `GET /exam-videos/stats-summary` хендлеру `get` с
  // `id='stats-summary'`.
  @Get('stats-summary')
  @ApiRoute('GET /exam-videos/stats-summary')
  @Roles('teacher', 'assistant', 'admin')
  getStatsSummary(): Promise<ExamVideoStatsDto> {
    return this.statsService.getSummary();
  }
}
