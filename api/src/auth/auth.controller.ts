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
import { SettingsService } from '../settings/settings.service';
import { botIdFromToken } from './bot-id-from-token';
import { AllowPending, CurrentUser, Public } from './auth.decorators';
import { AuthService } from './auth.service';
import type { RequestLike, ResponseLike } from '../common/http-headers';
import { parseTelegramLoginBody } from './parse-telegram-login-body';
import { TelegramAuthService } from './telegram-auth.service';
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
    private readonly settingsService: SettingsService,
  ) {}

  // Без сессии: экран входа и StudentScreen спрашивают конфигурацию до
  // того, как появится роль. telegramBotId — числовой префикс BOT_TOKEN
  // (валидатор гарантирует формат) для `window.Telegram.Login.auth()` на
  // фронте — без него кнопка входа не показывается. schoolSiteUrl — адрес
  // сайта школы из настроек (не `PUBLIC_URL`: это адрес самого кабинета,
  // В6 аудита, ADR-0009-доп.) для гостя без роли и незнакомца в боте.
  @Public()
  @Get('config')
  async getConfig(): Promise<AuthConfigDto> {
    const settings = await this.settingsService.get();
    return {
      telegramBotId: botIdFromToken(this.configService.get<string>('BOT_TOKEN')),
      schoolSiteUrl: settings.schoolSiteUrl,
    };
  }

  // @AllowPending: тот, кто ждёт подтверждения (ADR-0026), должен увидеть
  // своё имя и статус — экран ожидания строится из этого ответа.
  @AllowPending()
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
    // Нетипизированное тело — не TelegramLoginDto: под глобальный
    // ValidationPipe (forbidNonWhitelisted, app.setup.ts) эта форма не
    // должна попадать, см. parse-telegram-login-body.ts. Валидируем сами.
    @Body() rawBody: Record<string, unknown>,
    @Req() req: RequestLike,
    @Res({ passthrough: true }) res: ResponseLike,
  ): Promise<MeDto> {
    const body = await parseTelegramLoginBody(rawBody);
    // req.body, не body: подпись Telegram считается по сырому телу целиком
    // (см. комментарий у RequestLike.body в common/http-headers.ts).
    const { user, cookie } = await this.telegramAuthService.login(
      body,
      req.body ?? {},
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
