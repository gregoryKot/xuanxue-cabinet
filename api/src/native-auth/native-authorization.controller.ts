// Продолжение входа Daychi после входа в кабинет и обмен кода на bearer
// (ADR-0181, профиль Workshop 3c98d4a). Два разных мира в одном контроллере:
// `continue` — браузерный адрес (302 или локальная страница, как `authorize`),
// `token` — JSON API нативного клиента с `{"error":"<код>"}`. Поэтому фильтр и
// заголовки — на методе, а не на контроллере. Веб ходит на `continue` полным
// переходом, не через apiFetch, поэтому без @ApiRoute.
//
// @Public() и @SkipCsrf() — по той же причине, что у native-account.controller.ts:
// защищают привязка браузера и сессия (continue) или код с verifier (token), а
// не заголовок x-requested-with. Cookie сессии у `token` ничего не значит.
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseFilters,
  UseInterceptors,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { DateTime } from 'luxon';
import type { NativeTokenResponse } from '@xuanxue/shared';
import { Public, SkipCsrf } from '../auth/auth.decorators';
import { NATIVE_AUTH_THROTTLE } from '../auth/login-throttle';
import { NativeAuthorizationsService } from './native-authorizations.service';
import {
  NativeBrowserFlowService,
  type NativeBrowserRequest,
} from './native-browser-flow.service';
import {
  NativeBrowserPageFilter,
  sendNativeBrowserOutcome,
  type NativeBrowserResponseLike,
} from './native-browser-response';
import { NativeErrorFilter } from './native-error.filter';
import { assertFormRequest, type NativeRequestLike } from './native-http';
import { NativeNoStoreInterceptor } from './native-response';
import { NativeTokenDto } from './native-token.dto';

@Public()
@SkipCsrf()
@Throttle(NATIVE_AUTH_THROTTLE)
@Controller('auth/native')
export class NativeAuthorizationController {
  constructor(
    private readonly flow: NativeBrowserFlowService,
    private readonly authorizations: NativeAuthorizationsService,
  ) {}

  @Get('continue')
  @UseFilters(NativeBrowserPageFilter)
  async resume(
    @Req() req: NativeBrowserRequest,
    @Res() res: NativeBrowserResponseLike,
  ): Promise<void> {
    sendNativeBrowserOutcome(res, await this.flow.resume(req, DateTime.utc()));
  }

  @Post('token')
  @HttpCode(HttpStatus.OK)
  @UseFilters(NativeErrorFilter)
  @UseInterceptors(NativeNoStoreInterceptor)
  token(
    @Req() req: NativeRequestLike,
    @Body() body: NativeTokenDto,
  ): Promise<NativeTokenResponse> {
    assertFormRequest(req);
    return this.authorizations.exchange(body, DateTime.utc());
  }
}
