// Загрузка и раздача записи занятия файлом (ADR-0180, ADR-0165). Загрузка частями —
// только штат школы: старт (JSON), часть (сырое тело, video-uploads/
// video-upload-part-body.ts/app.setup.ts) и complete. GET — без @Roles: смотрит
// любой вошедший, доступ решает сервис (видео привязано к записи занятия,
// LessonVideosService.signedUrl), хендлер — VideoRedirectController.get
// (common/video-redirect.ts, доля с ExamVideosController): редирект на подписанную
// ссылку R2, байты идут мимо нашего инстанса (ADR-0057).
import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import { DateTime } from 'luxon';
import type { LessonVideoDto, VideoUploadDto } from '@xuanxue/shared';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import { ApiRoute } from '../common/api-route.decorator';
import { VideoRedirectController } from '../common/video-redirect';
import type { UserLean } from '../users/users.service';
import { CompleteVideoUploadDto } from '../video-uploads/complete-video-upload.dto';
import { StartLessonVideoDto } from './dto/start-lesson-video.dto';
import { LessonVideoUploadsService } from './lesson-video-uploads.service';
import { LessonVideosService } from './lesson-videos.service';

interface RawBodyRequest {
  body?: unknown;
}

@Controller('lesson-videos')
export class LessonVideosController extends VideoRedirectController<UserLean> {
  constructor(
    service: LessonVideosService,
    private readonly uploads: LessonVideoUploadsService,
  ) {
    super(service);
  }

  // Старт — на литеральном `uploads`, а не на корне: `POST /lesson-videos` не
  // существует (check-route-collisions.mjs).
  @Post('uploads')
  @ApiRoute('POST /lesson-videos/uploads')
  @HttpCode(HttpStatus.CREATED)
  @Roles('teacher', 'assistant', 'admin')
  start(
    @Body() body: StartLessonVideoDto,
    @CurrentUser() user: UserLean,
  ): Promise<VideoUploadDto> {
    return this.uploads.start(user.id, body, DateTime.utc());
  }

  @Put(':id/parts/:n')
  @ApiRoute('PUT /lesson-videos/:id/parts/:n')
  @Roles('teacher', 'assistant', 'admin')
  uploadPart(
    @Param('id') id: string,
    @Param('n', ParseIntPipe) n: number,
    @Req() req: RawBodyRequest,
    @CurrentUser() user: UserLean,
  ): Promise<VideoUploadDto> {
    return this.uploads.uploadPart(id, user.id, n, req.body, DateTime.utc());
  }

  @Post(':id/complete')
  @ApiRoute('POST /lesson-videos/:id/complete')
  @HttpCode(HttpStatus.CREATED)
  @Roles('teacher', 'assistant', 'admin')
  complete(
    @Param('id') id: string,
    @Body() body: CompleteVideoUploadDto,
    @CurrentUser() user: UserLean,
  ): Promise<LessonVideoDto> {
    return this.uploads.complete(id, user.id, DateTime.utc(), body.poster);
  }
}
