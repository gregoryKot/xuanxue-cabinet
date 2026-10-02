// Загрузка и раздача видео вопроса/варианта (ADR-0133, ADR-0165). Загрузка
// частями — только штат школы: старт (JSON), часть (сырое тело,
// video-uploads/video-upload-part-body.ts/app.setup.ts) и complete; прежний
// POST сырым телом (exam-video-body.ts) остаётся до перехода web. GET — без
// @Roles: ученику видео нужно на экране сдачи, доступ решает сервис по снимку
// его попытки (ExamVideosService.signedUrl, SECURITY §3), хендлер —
// VideoRedirectController.get (common/video-redirect.ts, доля с
// AnswerVideosController). В отличие от картинок (StreamableFile из Mongo)
// здесь редирект на подписанную ссылку R2 — байты идут мимо нашего
// инстанса (ADR-0057).
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import { DateTime } from 'luxon';
import type { ExamVideoDto, ExamVideoStatsDto, VideoUploadDto } from '@xuanxue/shared';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import { ApiRoute } from '../common/api-route.decorator';
import type { VideoUrlOptions } from '../common/video-link';
import { VideoRedirectController } from '../common/video-redirect';
import type { UserLean } from '../users/users.service';
import { StartExamVideoDto } from './dto/start-exam-video.dto';
import { ExamVideoStatsService } from './exam-video-stats.service';
import { ExamVideoUploadsService } from './exam-video-uploads.service';
import { ExamVideosService } from './exam-videos.service';

interface RawBodyRequest {
  body?: unknown;
}

@Controller('exam-videos')
export class ExamVideosController extends VideoRedirectController<UserLean> {
  constructor(
    private readonly service: ExamVideosService,
    private readonly statsService: ExamVideoStatsService,
    private readonly uploadsService: ExamVideoUploadsService,
  ) {
    super();
  }

  protected signedUrl(
    id: string,
    user: UserLean,
    now: DateTime,
    options: VideoUrlOptions,
  ): Promise<string> {
    return this.service.signedUrl(id, user, now, options);
  }

  // Прежняя загрузка одним сырым телом — уйдёт вместе со своим парсером и
  // предикатом, когда web перейдёт на части (ADR-0165).
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles('teacher', 'assistant', 'admin')
  upload(
    @Req() req: RawBodyRequest,
    @CurrentUser() user: UserLean,
  ): Promise<ExamVideoDto> {
    return this.service.upload(req.body, user.id, DateTime.utc());
  }

  // `POST /exam-videos` занят сырой загрузкой выше, поэтому старт — на
  // литеральном `uploads` (check-route-collisions.mjs).
  @Post('uploads')
  @ApiRoute('POST /exam-videos/uploads')
  @HttpCode(HttpStatus.CREATED)
  @Roles('teacher', 'assistant', 'admin')
  start(
    @Body() body: StartExamVideoDto,
    @CurrentUser() user: UserLean,
  ): Promise<VideoUploadDto> {
    return this.uploadsService.start(user.id, body, DateTime.utc());
  }

  @Put(':id/parts/:n')
  @ApiRoute('PUT /exam-videos/:id/parts/:n')
  @Roles('teacher', 'assistant', 'admin')
  uploadPart(
    @Param('id') id: string,
    @Param('n', ParseIntPipe) n: number,
    @Req() req: RawBodyRequest,
    @CurrentUser() user: UserLean,
  ): Promise<VideoUploadDto> {
    return this.uploadsService.uploadPart(id, user.id, n, req.body, DateTime.utc());
  }

  @Post(':id/complete')
  @ApiRoute('POST /exam-videos/:id/complete')
  @HttpCode(HttpStatus.CREATED)
  @Roles('teacher', 'assistant', 'admin')
  complete(
    @Param('id') id: string,
    @CurrentUser() user: UserLean,
  ): Promise<ExamVideoDto> {
    return this.uploadsService.complete(id, user.id, DateTime.utc());
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
