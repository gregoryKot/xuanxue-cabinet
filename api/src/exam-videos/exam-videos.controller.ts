// Загрузка и раздача видео вопроса/варианта (ADR-0133). POST принимает
// сырое тело (exam-video-body.ts/app.setup.ts), только штат школы; GET —
// без @Roles: ученику видео нужно на экране сдачи, доступ решает сервис по
// снимку его попытки (ExamVideosService.signedUrl, SECURITY §3). В отличие
// от картинок (StreamableFile из Mongo) здесь редирект на подписанную
// ссылку R2 — байты идут мимо нашего инстанса (ADR-0057).
import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { DateTime } from 'luxon';
import type { ExamVideoDto, ExamVideoStatsDto } from '@xuanxue/shared';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import type { UserLean } from '../users/users.service';
import { ExamVideoStatsService } from './exam-video-stats.service';
import { ExamVideosService } from './exam-videos.service';

// Ссылка живёт около часа (ExamVideosService.SIGNED_URL_TTL_SECONDS) — сам
// редирект не должен осесть ни в браузере, ни в промежуточном кеше: по
// протухшей ссылке R2 ответит отказом, и видео «перестанет открываться» без
// единой ошибки у нас (тот же приём, что MaterialFilesController.download).
const NO_STORE = 'no-store';
const CACHE_CONTROL_HEADER = 'Cache-Control';
const LOCATION_HEADER = 'Location';

interface RawBodyRequest {
  body?: unknown;
}

/** Минимальный интерфейс вместо @types/express — тот же приём, что
 * RedirectResponseLike в material-files.controller.ts. */
interface RedirectResponseLike {
  setHeader(name: string, value: string): unknown;
  status(code: number): unknown;
}

@Controller('exam-videos')
export class ExamVideosController {
  constructor(
    private readonly service: ExamVideosService,
    private readonly statsService: ExamVideoStatsService,
  ) {}

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
  @Roles('teacher', 'assistant', 'admin')
  getStatsSummary(): Promise<ExamVideoStatsDto> {
    return this.statsService.getSummary();
  }

  @Get(':id')
  async get(
    @Param('id') id: string,
    @CurrentUser() user: UserLean,
    @Res({ passthrough: true }) res: RedirectResponseLike,
  ): Promise<void> {
    const url = await this.service.signedUrl(id, user, DateTime.utc());
    res.setHeader(CACHE_CONTROL_HEADER, NO_STORE);
    res.setHeader(LOCATION_HEADER, url);
    res.status(HttpStatus.FOUND);
  }
}
