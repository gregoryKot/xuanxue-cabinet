// Вход через Telegram по OpenID Connect (ADR-0187) — отдельный контроллер, как
// GoogleAuthController: AuthController у потолка 150 строк (file-size-ratchet).
// `GET start` — навигация целой вкладкой (302 на oauth.telegram.org), не
// `apiFetch`: CSP её не ограничивает (security/csp.ts), в карте маршрутов её
// нет. `POST` — страница `/login/telegram` шлёт то, что Telegram вернул в
// адресе; CSRF как у любого мутирующего маршрута (`@Public()` не освобождает
// от `x-requested-with`, AuthGuard §(a)). Прежний `POST /auth/telegram`
// (подпись виджета, ADR-0028) живёт отдельно, пока не задан
// TELEGRAM_LOGIN_CLIENT_SECRET.
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
import { ApiRoute } from '../common/api-route.decorator';
import {
  asSingleHeader,
  type RequestLike,
  type ResponseLike,
} from '../common/http-headers';
import type { RedirectResponseLike } from '../common/video-redirect';
import { PersonalChats } from '../telegram/personal-chats';
import { Public } from './auth.decorators';
import { TELEGRAM_LOGIN_THROTTLE } from './login-throttle';
import { TelegramOidcLoginDto } from './telegram-oidc-login.dto';
import { clearTelegramOAuthCookie } from './telegram-oidc-cookie';
import { TelegramOidcService } from './telegram-oidc.service';
import { toMeDto } from './user.mapper';

const LOCATION_HEADER = 'Location';

@Controller('auth/telegram/oidc')
export class TelegramOidcController {
  constructor(
    private readonly telegramOidcService: TelegramOidcService,
    private readonly personalChats: PersonalChats,
  ) {}

  // `join` — код ссылки-приглашения (INVITE_QUERY_PARAM), как у входа через
  // виджет и Google. Формат проверяет TelegramOidcService.start(): невалидный
  // молча не попадает в cookie.
  @Public()
  @Throttle(TELEGRAM_LOGIN_THROTTLE)
  @Get('start')
  start(
    @Query(INVITE_QUERY_PARAM) joinCode: string | undefined,
    @Res({ passthrough: true }) res: RedirectResponseLike,
  ): void {
    const { cookie, url } = this.telegramOidcService.start(joinCode);
    res.setHeader('Set-Cookie', cookie);
    res.setHeader(LOCATION_HEADER, url);
    res.status(HttpStatus.FOUND);
  }

  @Public()
  @Throttle(TELEGRAM_LOGIN_THROTTLE)
  @ApiRoute('POST /auth/telegram/oidc')
  @Post()
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() body: TelegramOidcLoginDto,
    @Req() req: RequestLike,
    @Res({ passthrough: true }) res: ResponseLike,
  ): Promise<MeDto> {
    // Заявка одноразовая — cookie гасится СРАЗУ, до любого кода, который
    // может бросить (SECURITY §2): вторая попытка тем же телом не найдёт в
    // cookie ничего, даже если первая упала на середине.
    res.setHeader('Set-Cookie', clearTelegramOAuthCookie());
    const { user, cookies } = await this.telegramOidcService.login(
      body,
      asSingleHeader(req.headers.cookie),
      DateTime.utc(),
    );
    res.setHeader('Set-Cookie', [clearTelegramOAuthCookie(), ...cookies]);
    return toMeDto(user, await this.personalChats.hasActiveChatFor(user));
  }
}
