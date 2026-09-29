// /auth/me — под глобальным AuthGuard; /auth/logout и /auth/telegram — @Public():
// выход обязан чистить cookie даже без сессии, вход — способ её получить (CSRF
// по x-requested-with действует и тут, auth.guard.ts). Google/join/link/code —
// отдельными файлами рядом: этот у потолка 150 строк (file-size-ratchet).
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
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { DateTime } from 'luxon';
import { INVITE_QUERY_PARAM, type AuthConfigDto, type MeDto } from '@xuanxue/shared';
import { ApiRoute } from '../common/api-route.decorator';
import type { UserLean } from '../users/users.service';
import { SettingsService } from '../settings/settings.service';
import { FileStoreService } from '../storage/file-store.service';
import { PersonalChats } from '../telegram/personal-chats';
import { TelegramBotService } from '../telegram/telegram-bot.service';
import { botIdFromToken } from './bot-id-from-token';
import { CurrentUser, Public } from './auth.decorators';
import { AuthService } from './auth.service';
import type { RequestLike, ResponseLike } from '../common/http-headers';
import { EmailAuthService } from './email-auth.service';
import { GoogleAuthService } from './google-auth.service';
import { EMAIL_LOGIN_THROTTLE, TELEGRAM_LOGIN_THROTTLE } from './login-throttle';
import { parseTelegramLoginBody } from './parse-telegram-login-body';
import { RequestEmailLoginDto } from './request-email-login.dto';
import { TelegramAuthService } from './telegram-auth.service';
import { toMeDto } from './user.mapper';
import { VerifyEmailLoginDto } from './verify-email-login.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly telegramAuthService: TelegramAuthService,
    private readonly emailAuthService: EmailAuthService,
    private readonly googleAuthService: GoogleAuthService,
    private readonly configService: ConfigService,
    private readonly fileStore: FileStoreService,
    private readonly settingsService: SettingsService,
    private readonly telegramBotService: TelegramBotService,
    private readonly personalChats: PersonalChats,
  ) {}

  // Без сессии: экран входа спрашивает конфигурацию до появления роли. Поля —
  // тсдок AuthConfigDto (shared/src/auth.ts); *Enabled — те же проверки, что
  // перед самим действием (isEnabled() сервисов), один метод на оба места.
  @Public()
  @ApiRoute('GET /auth/config')
  @Get('config')
  async getConfig(): Promise<AuthConfigDto> {
    const settings = await this.settingsService.get();
    return {
      telegramBotId: botIdFromToken(this.configService.get<string>('BOT_TOKEN')),
      telegramBotUsername: this.telegramBotService.botUsername(),
      schoolSiteUrl: settings.schoolSiteUrl,
      dataControllerName: settings.dataControllerName,
      dataControllerContact: settings.dataControllerContact,
      emailLoginEnabled: this.emailAuthService.isEnabled(),
      googleLoginEnabled: this.googleAuthService.isEnabled(),
      fileStorageEnabled: this.fileStore.isEnabled,
    };
  }

  @ApiRoute('GET /auth/me')
  @Get('me')
  async me(@CurrentUser() user: UserLean): Promise<MeDto> {
    // AuthGuard уже сходил в UsersService.findById перед тем, как пропустить
    // запрос сюда — второй findById здесь был бы тем же чтением дважды.
    return toMeDto(user, await this.personalChats.hasActiveChatFor(user));
  }

  @Public()
  @Throttle(TELEGRAM_LOGIN_THROTTLE)
  @ApiRoute('POST /auth/telegram')
  @Post('telegram')
  @HttpCode(HttpStatus.OK)
  async loginWithTelegram(
    // Нетипизированное тело — не TelegramLoginDto: под глобальный
    // ValidationPipe (forbidNonWhitelisted, app.setup.ts) эта форма не
    // должна попадать, см. parse-telegram-login-body.ts. Валидируем сами.
    @Body() rawBody: Record<string, unknown>,
    // Код ссылки-приглашения (ADR-0030/0036) — в query, не в теле: подпись
    // Telegram считается по телу запроса целиком (см. ниже), и лишнее поле
    // там сломало бы её. Формат не проверяем здесь отдельно —
    // LoginIdentityService зовёт InviteLinkService.isValid(), который сам
    // отбрасывает всё, что не подходит под INVITE_CODE_RE.
    @Query(INVITE_QUERY_PARAM) inviteCode: string | undefined,
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
      inviteCode,
    );
    res.setHeader('Set-Cookie', cookie);
    return toMeDto(user, await this.personalChats.hasActiveChatFor(user));
  }

  // Всегда 204: найден ли email и ушло ли письмо (cooldown), не раскрываем —
  // иначе видно, кто зарегистрирован (SECURITY §2). Исключение — фича выключена
  // конфигурацией: NotAvailableError (503), 204 не изображаем.
  @Public()
  @Throttle(EMAIL_LOGIN_THROTTLE)
  @ApiRoute('POST /auth/email/request')
  @Post('email/request')
  @HttpCode(HttpStatus.NO_CONTENT)
  async requestEmailLogin(@Body() body: RequestEmailLoginDto): Promise<void> {
    await this.emailAuthService.requestLink(body.email, DateTime.utc(), body.inviteCode);
  }

  @Public()
  @Throttle(EMAIL_LOGIN_THROTTLE)
  @ApiRoute('POST /auth/email/verify')
  @Post('email/verify')
  @HttpCode(HttpStatus.OK)
  async verifyEmailLogin(
    @Body() body: VerifyEmailLoginDto,
    @Res({ passthrough: true }) res: ResponseLike,
  ): Promise<MeDto> {
    const { user, cookie } = await this.emailAuthService.verify(
      body.token,
      DateTime.utc(),
      body.inviteCode,
    );
    res.setHeader('Set-Cookie', cookie);
    return toMeDto(user, await this.personalChats.hasActiveChatFor(user));
  }

  @Public()
  @ApiRoute('POST /auth/logout')
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  logout(@Res({ passthrough: true }) res: ResponseLike): void {
    res.setHeader('Set-Cookie', this.authService.logoutCookie());
  }
}
