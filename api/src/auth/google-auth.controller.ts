// Вход через Google и привязка из профиля (ADR-0145) — отдельный
// контроллер, не методы в AuthController: тот уже у потолка 150 строк
// (file-size-ratchet), тот же приём, что у EmailCodeController/
// TelegramLinkController. `start` — навигация целой вкладкой (302 на Google
// или, при `intent=link` без сессии, на `/login`), не `apiFetch`: CSP её не
// ограничивает (см. security/csp.ts). `POST auth/google` — один эндпоинт на
// оба намерения: странице `/login/google` неоткуда узнать заранее, вход это
// или привязка — намерение лежит в httpOnly cookie google_oauth, не в
// адресе. CSRF действует как у любого мутирующего маршрута (`@Public()` не
// освобождает от `x-requested-with`, AuthGuard §(a)).
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
import {
  GOOGLE_INTENT_QUERY_PARAM,
  INVITE_QUERY_PARAM,
  type MeDto,
} from '@xuanxue/shared';
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
  // входа, только при обычном входе; `intent=link` его игнорирует (ADR-0145:
  // привязка не заводит нового человека). Формат `join` проверяется внутри
  // GoogleAuthService.start(), невалидный молча не сохраняется в cookie.
  // Без @CurrentUser(): маршрут @Public — привязке нужна сессия, но гвард её
  // не требует на публичных путях, поэтому сервис читает cookie сам
  // (findSessionUser) и решает по факту, не по декоратору.
  @Public()
  @Throttle(GOOGLE_LOGIN_THROTTLE)
  @Get('start')
  async start(
    @Query(INVITE_QUERY_PARAM) joinCode: string | undefined,
    @Query(GOOGLE_INTENT_QUERY_PARAM) intent: string | undefined,
    @Req() req: RequestLike,
    @Res({ passthrough: true }) res: RedirectResponseLike,
  ): Promise<void> {
    const result = await this.googleAuthService.start(
      { joinCode, intent },
      asSingleHeader(req.headers.cookie),
      DateTime.utc(),
    );
    if (result.kind === 'oauth') res.setHeader('Set-Cookie', result.cookie);
    res.setHeader(LOCATION_HEADER, result.url);
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
    const cookieHeader = asSingleHeader(req.headers.cookie);
    const { user, cookie } = await this.googleAuthService.login(
      body,
      cookieHeader,
      DateTime.utc(),
    );
    // `cookie` — только у входа (GoogleAuthService.login): привязка не
    // выпускает новую сессию (ADR-0059, тот же принцип у EmailLinkService),
    // клиент уже вошёл тем токеном, что принёс с собой.
    res.setHeader(
      'Set-Cookie',
      cookie ? [clearGoogleOAuthCookie(), cookie] : clearGoogleOAuthCookie(),
    );
    return toMeDto(user, await this.personalChats.hasActiveChatFor(user));
  }
}
