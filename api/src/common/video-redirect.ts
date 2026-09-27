// 302 на подписанную ссылку R2 (ExamVideosController/AnswerVideosController)
// — вынесено сюда целиком как базовый класс контроллера, а не только
// заголовки: у ExamVideosController.get и AnswerVideosController.get
// совпадал бы весь хендлер до последней скобки (CLAUDE.md «Дубли и мёртвый
// код», jscpd-храповик поймал бы это как клон). `VideoRedirectController` —
// не `@Controller()` сам по себе (без декоратора, маршрут наследует тот, кто
// расширяет класс своим `@Controller(...)` — Nest сканирует унаследованные
// методы наравне со своими). `no-store`: сам редирект не должен осесть ни в
// браузере, ни в промежуточном кеше — по протухшей ссылке R2 ответит
// отказом (ADR-0133).
import { Get, HttpStatus, Param, Res } from '@nestjs/common';
import { DateTime } from 'luxon';
import { CurrentUser } from '../auth/auth.decorators';

const NO_STORE = 'no-store';
const CACHE_CONTROL_HEADER = 'Cache-Control';
const LOCATION_HEADER = 'Location';

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

/** `U` — тип пользователя сессии (`UserLean`), параметром, а не прямым
 * импортом users/: common/ не должен знать о конкретном домене. Наследник
 * реализует только `signedUrl` — свою проверку владения/роли и адрес объекта. */
export abstract class VideoRedirectController<U> {
  protected abstract signedUrl(id: string, user: U, now: DateTime): Promise<string>;

  @Get(':id')
  async get(
    @Param('id') id: string,
    @CurrentUser() user: U,
    @Res({ passthrough: true }) res: RedirectResponseLike,
  ): Promise<void> {
    const url = await this.signedUrl(id, user, DateTime.utc());
    setVideoRedirect(res, url, HttpStatus.FOUND);
  }
}
