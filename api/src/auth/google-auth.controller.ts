// Вход через Google (ADR-0145) — отдельный контроллер, не методы в
// AuthController: тот уже у потолка 150 строк (file-size-ratchet), тот же
// приём, что у EmailCodeController/TelegramLinkController. `start` —
// навигация целой вкладкой (302 на Google), не `apiFetch`: CSP её не
// ограничивает (см. security/csp.ts). `POST auth/google` — CSRF действует
// как у любого мутирующего маршрута (`@Public()` не освобождает от
// `x-requested-with`, AuthGuard §(a)); тело шлёт страница `/login/google`
// (web) тем же `apiFetch`, что остальные входы.
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { DateTime } from 'luxon';
import { INVITE_QUERY_PARAM, type MeDto } from '@xuanxue/shared';
import { PersonalChats } from '../telegram/personal-chats';
import {
  asSingleHeader,
  type RequestLike,
  type ResponseLike,
} from '../common/http-headers';
import type { RedirectResponseLike } from '../common/video-redirect';
import { Public } from './auth.decorators';
import { GoogleAuthService } from './google-auth.service';
import { GoogleLoginDto } from './google-login.dto';
import { clearGoogleOAuthCookie } from './google-oauth-cookie';
import { GOOGLE_LOGIN_THROTTLE } from './login-throttle';
import { toMeDto } from './user.mapper';

const LOCATION_HEADER = 'Location';

@Controller('auth/google')
export class GoogleAuthController {
  constructor(
    private readonly googleAuthService: GoogleAuthService,
    private readonly personalChats: PersonalChats,
  ) {}

  // `join` — код ссылки-приглашения (INVITE_QUERY_PARAM), как у Telegram-
  // входа: query, не тело — тела у GET нет вовсе. Формат проверяется внутри
  // GoogleAuthService.start(), невалидный молча не сохраняется в cookie.
  @Public()
  @Throttle(GOOGLE_LOGIN_THROTTLE)
  @Get('start')
  start(
    @Query(INVITE_QUERY_PARAM) joinCode: string | undefined,
    @Res({ passthrough: true }) res: RedirectResponseLike,
  ): void {
    const { cookie, url } = this.googleAuthService.start(joinCode);
    res.setHeader('Set-Cookie', cookie);
    res.setHeader(LOCATION_HEADER, url);
    res.status(HttpStatus.FOUND);
  }

  @Public()
  @Throttle(GOOGLE_LOGIN_THROTTLE)
  @Post()
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() body: GoogleLoginDto,
    @Req() req: RequestLike,
    @Res({ passthrough: true }) res: ResponseLike,
  ): Promise<MeDto> {
    // Заявка одноразовая — cookie гасится СРАЗУ, до любого кода, который
    // может бросить (SECURITY §2): вторая попытка тем же телом не найдёт в
    // cookie ничего, даже если первая упала на середине.
    res.setHeader('Set-Cookie', clearGoogleOAuthCookie());
    const { user, cookie } = await this.googleAuthService.login(
      body,
      asSingleHeader(req.headers.cookie),
      DateTime.utc(),
    );
    res.setHeader('Set-Cookie', [clearGoogleOAuthCookie(), cookie]);
    return toMeDto(user, await this.personalChats.hasActiveChatFor(user));
  }
}
