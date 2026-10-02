// PUT .../parts/:n, POST .../complete, GET .../stats-summary, GET /:id
// (ADR-0137). Часть — сырое тело (answer-video-part-body.ts/app.setup.ts),
// сессия ученика; complete — тоже ученик (владение проверяет сервис);
// stats-summary — только штат школы, литеральный путь ДО `:id` (тот же
// приём, что ExamVideosController.getStatsSummary); get — без @Roles,
// доступ решает сервис (владелец или штат).
import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import { DateTime } from 'luxon';
import type {
  AnswerVideoStatsDto,
  AnswerVideoUploadDto,
  ExamMediaDto,
} from '@xuanxue/shared';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import { ApiRoute } from '../common/api-route.decorator';
import { VideoRedirectController } from '../common/video-redirect';
import type { UserLean } from '../users/users.service';
import { AnswerVideoCompleteService } from './answer-video-complete';
import { AnswerVideoPartService } from './answer-video-part';
import { AnswerVideoStatsService } from './answer-video-stats.service';
import { AnswerVideosService } from './answer-videos.service';

interface RawBodyRequest {
  body?: unknown;
}

@Controller('answer-videos')
export class AnswerVideosController extends VideoRedirectController<UserLean> {
  constructor(
    private readonly partService: AnswerVideoPartService,
    private readonly completeService: AnswerVideoCompleteService,
    private readonly service: AnswerVideosService,
    private readonly statsService: AnswerVideoStatsService,
  ) {
    super();
  }

  protected signedUrl(id: string, user: UserLean, now: DateTime): Promise<string> {
    return this.service.signedUrl(id, user, now);
  }

  @Put(':id/parts/:n')
  @ApiRoute('PUT /answer-videos/:id/parts/:n')
  uploadPart(
    @Param('id') id: string,
    // Не ParseIntPipe: его английский «Validation failed (numeric string is
    // expected)» уходил ученику как есть (аудит 2026-10-01, F46). Сервис сам
    // проверяет целое в диапазоне и отвечает текстом по VOICE.
    @Param('n') n: string,
    @Req() req: RawBodyRequest,
    @CurrentUser() user: UserLean,
  ): Promise<AnswerVideoUploadDto> {
    return this.partService.uploadPart(id, user.id, Number(n), req.body, DateTime.utc());
  }

  @Post(':id/complete')
  @ApiRoute('POST /answer-videos/:id/complete')
  @HttpCode(HttpStatus.CREATED)
  complete(
    @Param('id') id: string,
    @CurrentUser() user: UserLean,
  ): Promise<ExamMediaDto> {
    return this.completeService.complete(id, user.id, DateTime.utc());
  }

  // Литеральный путь ДО `:id` — иначе Nest отдаст его хендлеру `get` с
  // `id='stats-summary'` (тот же приём, что ExamVideosController).
  @Get('stats-summary')
  @ApiRoute('GET /answer-videos/stats-summary')
  @Roles('teacher', 'assistant', 'admin')
  getStatsSummary(): Promise<AnswerVideoStatsDto> {
    return this.statsService.getSummary();
  }
}
