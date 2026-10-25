// Вход нативного Daychi из системного браузера (ADR-0181, профиль Workshop
// 3c98d4a, «Browser authorization and callback»). Путь — от корня сайта, без
// `/api`: профиль считает его от issuer (ROOT_ROUTES, common/root-routes.ts).
// Это браузерный адрес, а не JSON API: ответ — 302 в Daychi, на экран входа или
// локальная страница 400. Веб сюда не ходит, поэтому без @ApiRoute.
//
// @Public() — сессию поток читает сам и решает по факту, AuthGuard здесь не
// судья. @SkipCsrf() — GET из чужого приложения, заголовка x-requested-with
// нет и быть не может. Троттлинг — по IP или по сессии браузера (ADR-0164).
import { Controller, Get, Req, Res, UseFilters } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { DateTime } from 'luxon';
import { Public, SkipCsrf } from '../auth/auth.decorators';
import { NATIVE_AUTH_THROTTLE } from '../auth/login-throttle';
import {
  NativeBrowserFlowService,
  type NativeBrowserRequest,
} from './native-browser-flow.service';
import {
  NativeBrowserPageFilter,
  sendNativeBrowserOutcome,
  type NativeBrowserResponseLike,
} from './native-browser-response';

@Public()
@SkipCsrf()
@Throttle(NATIVE_AUTH_THROTTLE)
@UseFilters(NativeBrowserPageFilter)
@Controller('auth/native/authorize')
export class NativeAuthorizeController {
  constructor(private readonly flow: NativeBrowserFlowService) {}

  @Get()
  async authorize(
    @Req() req: NativeBrowserRequest,
    @Res() res: NativeBrowserResponseLike,
  ): Promise<void> {
    sendNativeBrowserOutcome(res, await this.flow.authorize(req, DateTime.utc()));
  }
}
