// /auth/me, /auth/logout и /auth/telegram — под глобальным AuthGuard.
// /auth/logout и /auth/telegram помечены @Public(): выход обязан чистить
// cookie даже без валидной сессии, вход — способ её получить. CSRF-проверка
// (x-requested-with) при этом всё равно действует, см. auth.guard.ts.
// POST /auth/join/check (ADR-0034) — в JoinController рядом: отдельного
// POST /auth/join («войти, затем присоединиться») больше нет, но и один
// оставшийся эндпоинт не влез бы в этот файл до 150 строк (file-size-ratchet).
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
import type { UserLean } from '../users/users.service';
import { SettingsService } from '../settings/settings.service';
import { TelegramBotService } from '../telegram/telegram-bot.service';
import { botIdFromToken } from './bot-id-from-token';
import { CurrentUser, Public } from './auth.decorators';
import { AuthService } from './auth.service';
import type { RequestLike, ResponseLike } from '../common/http-headers';
import { EmailAuthService } from './email-auth.service';
import { parseTelegramLoginBody } from './parse-telegram-login-body';
import { RequestEmailLoginDto } from './request-email-login.dto';
import { TelegramAuthService } from './telegram-auth.service';
import { toMeDto } from './user.mapper';
import { VerifyEmailLoginDto } from './verify-email-login.dto';

// Троттлинг по IP (глобальный ThrottlerGuard бакетирует неверифицированных,
// CLAUDE.md №4) — отдельный, более жёсткий лимит на попытки входа, чем
// общие 120/мин на всё API. Один лимит на Telegram и email — тот же профиль
// злоупотребления (перебор), SECURITY §2.
const TELEGRAM_LOGIN_THROTTLE = { default: { limit: 10, ttl: 60_000 } };
const EMAIL_LOGIN_THROTTLE = { default: { limit: 10, ttl: 60_000 } };

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly telegramAuthService: TelegramAuthService,
    private readonly emailAuthService: EmailAuthService,
    private readonly configService: ConfigService,
    private readonly settingsService: SettingsService,
    private readonly telegramBotService: TelegramBotService,
  ) {}

  // Без сессии: экран входа и StudentScreen спрашивают конфигурацию до
  // того, как появится роль. telegramBotId — числовой префикс BOT_TOKEN
  // (валидатор гарантирует формат), нужен фронту, чтобы собрать адрес
  // перехода на Telegram (ADR-0028) — без него кнопка входа не показывается.
  // schoolSiteUrl — адрес сайта школы из настроек (не `PUBLIC_URL`: это
  // адрес самого кабинета, В6 аудита, ADR-0009-доп.) для гостя без роли и
  // незнакомца в боте. emailLoginEnabled — та же проверка, что перед
  // отправкой письма (EmailAuthService.isEnabled(), ADR-0029), один метод на
  // оба места, не дублируем список из трёх переменных (CLAUDE.md «Дубли»).
  @Public()
  @Get('config')
  async getConfig(): Promise<AuthConfigDto> {
    const settings = await this.settingsService.get();
    return {
      telegramBotId: botIdFromToken(this.configService.get<string>('BOT_TOKEN')),
      telegramBotUsername: this.telegramBotService.botUsername(),
      schoolSiteUrl: settings.schoolSiteUrl,
      emailLoginEnabled: this.emailAuthService.isEnabled(),
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
    // Нетипизированное тело — не TelegramLoginDto: под глобальный
    // ValidationPipe (forbidNonWhitelisted, app.setup.ts) эта форма не
    // должна попадать, см. parse-telegram-login-body.ts. Валидируем сами.
    @Body() rawBody: Record<string, unknown>,
    // Код ссылки-приглашения (ADR-0030/0034) — в query, не в теле: подпись
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
    return toMeDto(user);
  }

  // Ответ всегда 204, независимо от того, найден email в базе или нет и
  // ушло ли письмо из-за cooldown (EmailAuthService.requestLink) — на
  // «неизвестном» email нельзя отвечать иначе, это раскрывало бы, кто уже
  // зарегистрирован (SECURITY §2). Исключение — сама фича выключена
  // конфигурацией: тогда NotAvailableError (503), 204 не изображаем.
  @Public()
  @Throttle(EMAIL_LOGIN_THROTTLE)
  @Post('email/request')
  @HttpCode(HttpStatus.NO_CONTENT)
  async requestEmailLogin(@Body() body: RequestEmailLoginDto): Promise<void> {
    await this.emailAuthService.requestLink(body.email, DateTime.utc(), body.inviteCode);
  }

  @Public()
  @Throttle(EMAIL_LOGIN_THROTTLE)
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
    return toMeDto(user);
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  logout(@Res({ passthrough: true }) res: ResponseLike): void {
    res.setHeader('Set-Cookie', this.authService.logoutCookie());
  }
}
