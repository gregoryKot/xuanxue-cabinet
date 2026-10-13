// Вход из wiki (ADR-0183): браузерный адрес от корня сайта, без `/api` (ROOT_ROUTES,
// common/root-routes.ts). Ответ — 303 на wiki или на вход кабинета либо локальная
// страница. Веб кабинета сюда не ходит, поэтому без @ApiRoute.
//
// @Public() — сессию маршрут читает сам и решает по факту, AuthGuard здесь не
// судья. @SkipCsrf() не нужен: GET не мутирует. Троттлинг — глобальный
// ThrottlerGuard (ADR-0164), его 429 отдаёт WikiEntryThrottleFilter.
import { Controller, Get, Req, Res, UseFilters } from '@nestjs/common';
import { DateTime } from 'luxon';
import { Public } from '../auth/auth.decorators';
import {
  sendWikiEntryOutcome,
  WikiEntryThrottleFilter,
  type WikiEntryResponseLike,
} from './wiki-entry-response';
import { WikiEntryService, type WikiEntryRequest } from './wiki-entry.service';

@Public()
@UseFilters(WikiEntryThrottleFilter)
@Controller('wiki')
export class WikiEntryController {
  constructor(private readonly entry: WikiEntryService) {}

  @Get()
  async enter(
    @Req() req: WikiEntryRequest,
    @Res() res: WikiEntryResponseLike,
  ): Promise<void> {
    sendWikiEntryOutcome(res, await this.entry.enter(req, DateTime.utc()));
  }
}
