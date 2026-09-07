// /auth/me, /auth/logout и /auth/telegram — под глобальным AuthGuard.
// /auth/logout и /auth/telegram помечены @Public(): выход обязан чистить
// cookie даже без валидной сессии, вход — способ её получить. CSRF-проверка
// (x-requested-with) при этом всё равно действует для обоих, см. auth.guard.ts.
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { DateTime } from 'luxon';
import type { AuthConfigDto, MeDto } from '@xuanxue/shared';
import type { UserLean } from '../users/users.service';
import { botIdFromToken } from './bot-id-from-token';
import { CurrentUser, Public } from './auth.decorators';
import { AuthService } from './auth.service';
import type { RequestLike, ResponseLike } from '../common/http-headers';
import { TelegramAuthService } from './telegram-auth.service';
import { TelegramLoginDto } from './telegram-login.dto';
import { toMeDto } from './user.mapper';

// Троттлинг по IP (глобальный ThrottlerGuard бакетирует неверифицированных,
// CLAUDE.md №4) — отдельный, более жёсткий лимит на попытки входа, чем
// общие 120/мин на всё API.
const TELEGRAM_LOGIN_THROTTLE = { default: { limit: 10, ttl: 60_000 } };

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly telegramAuthService: TelegramAuthService,
    private readonly configService: ConfigService,
  ) {}

  // Без сессии: экран входа спрашивает конфигурацию до того, как она
  // появится. telegramBotId — числовой префикс BOT_TOKEN (валидатор
  // гарантирует формат) для `window.Telegram.Login.auth()` на фронте —
  // без него кнопка входа не показывается. publicUrl — ссылка на сайт школы
  // для гостя без роли (RequireAuth.tsx).
  @Public()
  @Get('config')
  getConfig(): AuthConfigDto {
    return {
      telegramBotId: botIdFromToken(this.configService.get<string>('BOT_TOKEN')),
      publicUrl: this.configService.get<string>('PUBLIC_URL'),
    };
  }

  @Get('me')
  me(@CurrentUser() user: UserLean): MeDto {
    // AuthGuard уже сходил в UsersService.findById перед тем, как пропустить
    // запрос сюда — второй findById здесь был бы тем же чтением дважды.
    return toMeDto(user);
  }

  @Public()
  @Throttle(TELEGRAM_LOGIN_THROTTLE)
  @Post('telegram')
  @HttpCode(HttpStatus.OK)
  async loginWithTelegram(
    @Body() body: TelegramLoginDto,
    @Req() req: RequestLike,
    @Res({ passthrough: true }) res: ResponseLike,
  ): Promise<MeDto> {
    // req.body, не body: подпись Telegram считается по сырому телу целиком
    // (см. комментарий у RequestLike.body в common/http-headers.ts).
    const rawBody = req.body ?? {};
    const { user, cookie } = await this.telegramAuthService.login(
      body,
      rawBody,
      DateTime.utc(),
    );
    res.setHeader('Set-Cookie', cookie);
    return toMeDto(user);
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  logout(@Res({ passthrough: true }) res: ResponseLike): void {
    res.setHeader('Set-Cookie', this.authService.logoutCookie());
  }
}
