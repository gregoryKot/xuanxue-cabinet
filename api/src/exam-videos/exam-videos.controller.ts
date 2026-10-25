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
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { DateTime } from 'luxon';
import type { ExamVideoDto, ExamVideoStatsDto, VideoUploadDto } from '@xuanxue/shared';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import { ApiRoute } from '../common/api-route.decorator';
import {
  VideoRedirectController,
  type RedirectResponseLike,
} from '../common/video-redirect';
import type { UserLean } from '../users/users.service';
import { CompleteVideoUploadDto } from '../video-uploads/complete-video-upload.dto';
import { SetVideoPosterDto } from '../video-uploads/set-video-poster.dto';
import { applyVideoBytesHeaders } from '../video-uploads/video-bytes';
import { StartExamVideoDto } from './dto/start-exam-video.dto';
import { ExamVideoStatsService } from './exam-video-stats.service';
import { ExamVideoUploadsService } from './exam-video-uploads.service';
import { ExamVideosService } from './exam-videos.service';

// Декодер в браузере ходит за байтами кусками, по несколько запросов на видео, а
// общий лимит 120 в минуту на маршрут (ADR-0164) кончился бы на второй пачке
// кадров (ADR-0182). Лимит всё равно считается по сессии штата, не по IP.
const VIDEO_BYTES_THROTTLE = { default: { limit: 600, ttl: 60_000 } };

interface RawBodyRequest {
  body?: unknown;
}

@Controller('exam-videos')
export class ExamVideosController extends VideoRedirectController<UserLean> {
  constructor(
    private readonly examVideos: ExamVideosService,
    private readonly statsService: ExamVideoStatsService,
    private readonly uploadsService: ExamVideoUploadsService,
  ) {
    super(examVideos);
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

  // Тот же приём: литеральный путь ДО `:id` базового класса (ADR-0182). Наследник
  // регистрируется раньше родителя, как и у `stats-summary`.
  @Get('without-poster')
  @ApiRoute('GET /exam-videos/without-poster')
  @Roles('teacher', 'assistant', 'admin')
  listWithoutPoster(): Promise<ExamVideoDto[]> {
    return this.examVideos.listWithoutPoster();
  }

  @Put(':id/poster')
  @ApiRoute('PUT /exam-videos/:id/poster')
  @Roles('teacher', 'assistant', 'admin')
  setPoster(
    @Param('id') id: string,
    @Body() body: SetVideoPosterDto,
    @CurrentUser() user: UserLean,
  ): Promise<ExamVideoDto> {
    return this.examVideos.setPoster(id, user, body.poster);
  }

  // Байты объекта R2 со своего домена, с `Range` (ADR-0182, исключение из
  // ADR-0057): декодер читает индекс и первые кадры, а не файл целиком. В карту
  // маршрутов не входит — адрес открывает декодер сам, не `apiRoute`.
  @Get(':id/bytes')
  @Throttle(VIDEO_BYTES_THROTTLE)
  @Roles('teacher', 'assistant', 'admin')
  async bytes(
    @Param('id') id: string,
    @Headers('range') range: string | undefined,
    @CurrentUser() user: UserLean,
    @Res({ passthrough: true }) res: RedirectResponseLike,
  ): Promise<StreamableFile> {
    const stream = await this.examVideos.openBytes(id, user, DateTime.utc(), range);
    applyVideoBytesHeaders(res, stream);
    return new StreamableFile(stream.body);
  }
}
