// Загрузка и раздача видео вопроса/варианта (ADR-0133, ADR-0165). Загрузка
// частями — только штат школы: старт (JSON), часть (сырое тело,
// video-uploads/video-upload-part-body.ts/app.setup.ts) и complete; прежней
// загрузки одним сырым телом больше нет. GET — без
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
import { VideoRedirectController } from '../common/video-redirect';
import type { UserLean } from '../users/users.service';
import { CompleteVideoUploadDto } from '../video-uploads/complete-video-upload.dto';
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
    service: ExamVideosService,
    private readonly statsService: ExamVideoStatsService,
    private readonly uploadsService: ExamVideoUploadsService,
  ) {
    super(service);
  }

  // Старт — на литеральном `uploads`, а не на корне: `POST /exam-videos` у
  // видео вопроса не существует (check-route-collisions.mjs).
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
    @Body() body: CompleteVideoUploadDto,
    @CurrentUser() user: UserLean,
  ): Promise<ExamVideoDto> {
    return this.uploadsService.complete(id, user.id, DateTime.utc(), body.poster);
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
