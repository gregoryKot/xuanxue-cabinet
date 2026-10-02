// 302 на подписанную ссылку R2 (ExamVideosController/AnswerVideosController)
// — вынесено сюда целиком как базовый класс контроллера, а не только
// заголовки: у ExamVideosController.get и AnswerVideosController.get
// совпадал бы весь хендлер до последней скобки (CLAUDE.md «Дубли и мёртвый
// код», jscpd-храповик поймал бы это как клон). `VideoRedirectController` —
// не `@Controller()` сам по себе (без декоратора, маршрут наследует тот, кто
// расширяет класс своим `@Controller(...)` — Nest сканирует унаследованные
// методы наравне со своими). `no-store`: сам редирект не должен осесть ни в
// браузере, ни в промежуточном кеше — по протухшей ссылке R2 ответит
// отказом (ADR-0133). `?download=1` — та же ссылка с `attachment`
// (video-link.ts, ADR-0165): проверка доступа одна и та же, различается
// только подпись. Туда же — кадр-превью (`GET :id/poster`, ADR-0165): права те
// же, что у видео, поэтому он берётся тем же сервисом и живёт в той же базе.
import { Get, HttpStatus, Param, Query, Res, StreamableFile } from '@nestjs/common';
import { DateTime } from 'luxon';
import { VIDEO_POSTER_NOT_FOUND_MESSAGE } from '@xuanxue/shared';
import { CurrentUser } from '../auth/auth.decorators';
import { NotFoundError } from './errors';
import { VIEW_VIDEO, type VideoUrlOptions } from './video-link';
import { VideoDownloadQueryDto } from './video-download-query.dto';

const NO_STORE = 'no-store';
const CACHE_CONTROL_HEADER = 'Cache-Control';
const LOCATION_HEADER = 'Location';
const POSTER_CONTENT_TYPE = 'image/jpeg';
// Кадр не меняется после complete, а запрашивается при каждом показе плеера:
// сутки в браузере — без лишнего хода на сервер. `private` — доступ у каждого свой.
const POSTER_CACHE_CONTROL = 'private, max-age=86400';

/** Минимальный интерфейс вместо @types/express — тот же приём, что
 * RedirectResponseLike в material-files.controller.ts. */
export interface RedirectResponseLike {
  setHeader(name: string, value: string): unknown;
  status(code: number): unknown;
}

function setVideoRedirect(
  res: RedirectResponseLike,
  url: string,
  foundStatus: number,
): void {
  res.setHeader(CACHE_CONTROL_HEADER, NO_STORE);
  res.setHeader(LOCATION_HEADER, url);
  res.status(foundStatus);
}

/** Что базовому контроллеру нужно от сервиса видео своего вида (ExamVideosService,
 * AnswerVideosService): подписанная ссылка и кадр-превью, обе с проверкой доступа
 * этого вида. `U` — тип пользователя сессии (`UserLean`), параметром, а не прямым
 * импортом users/: common/ не должен знать о конкретном домене. */
export interface VideoAccess<U> {
  signedUrl(
    id: string,
    user: U,
    now: DateTime,
    options: VideoUrlOptions,
  ): Promise<string>;
  /** `null` — у видео нет кадра; чужому и не готовому видео — NotFoundError. */
  loadPoster(id: string, user: U): Promise<Buffer | null>;
}

/** Наследник передаёт свой сервис в `super(service)` — своей проверки владения/
 * роли и адреса объекта в контроллере нет, она у сервиса. */
export abstract class VideoRedirectController<U> {
  protected constructor(private readonly video: VideoAccess<U>) {}

  @Get(':id')
  async get(
    @Param('id') id: string,
    @Query() query: VideoDownloadQueryDto,
    @CurrentUser() user: U,
    @Res({ passthrough: true }) res: RedirectResponseLike,
  ): Promise<void> {
    const options = query.download ? { download: true } : VIEW_VIDEO;
    const url = await this.video.signedUrl(id, user, DateTime.utc(), options);
    setVideoRedirect(res, url, HttpStatus.FOUND);
  }

  // Нет кадра — 404 в общем конверте: старые видео его не имеют, и плеер
  // рисует их как раньше (ADR-0165).
  @Get(':id/poster')
  async poster(
    @Param('id') id: string,
    @CurrentUser() user: U,
    @Res({ passthrough: true }) res: RedirectResponseLike,
  ): Promise<StreamableFile> {
    const bytes = await this.video.loadPoster(id, user);
    if (!bytes) throw new NotFoundError(VIDEO_POSTER_NOT_FOUND_MESSAGE);
    res.setHeader(CACHE_CONTROL_HEADER, POSTER_CACHE_CONTROL);
    return new StreamableFile(bytes, { type: POSTER_CONTENT_TYPE });
  }
}
