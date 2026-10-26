// Вход через Telegram по OpenID Connect (ADR-0187, authorization code + PKCE,
// SECURITY §2) — замена прежнему переходу с `#tgAuthResult` (ADR-0028), после
// подтверждения которого Telegram стал закрывать страницу. Поток тот же, что у
// Google (ADR-0145): start() ставит cookie заявки и отдаёт адрес Telegram,
// login() сверяет state, меняет код на id_token (TelegramOidcTokenClient),
// проверяет claims (telegram-oidc-id-token.ts) и выпускает ту же сессию
// (AuthService.issueSession, ADR-0012). Поиск/создание человека —
// LoginIdentityService.resolveTelegramUser, ровно как у виджета: ключ входа тот
// же `users.telegramId`, новый человек заводится только с валидной
// ссылкой-приглашением (ADR-0030/0036).
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { DateTime } from 'luxon';
import {
  ACCESS_MESSAGE,
  INVITE_CODE_RE,
  TELEGRAM_LOGIN_FAILED_MESSAGE,
  TELEGRAM_OIDC_NOT_AVAILABLE_MESSAGE,
  type TelegramOidcLoginInput,
} from '@xuanxue/shared';
import type { NodeEnv } from '../config/env.validation';
import { errorMessage } from '../common/error-info';
import { ForbiddenError, NotAvailableError, UnauthorizedError } from '../common/errors';
import { LoginIdentityService } from '../users/login-identity.service';
import { UsersService, type UserLean } from '../users/users.service';
import { AuthService } from './auth.service';
import {
  codeChallenge,
  randomUrlSafe,
  timingSafeEqualStrings,
} from './google-oauth-pkce';
import { telegramOidcConfig, type TelegramOidcConfig } from './telegram-oidc-config';
import {
  buildTelegramOAuthCookie,
  readTelegramOAuthCookie,
} from './telegram-oidc-cookie';
import {
  parseTelegramIdToken,
  type TelegramOidcIdentity,
} from './telegram-oidc-id-token';
import { TelegramOidcTokenClient } from './telegram-oidc-token-client';
import { buildTelegramAuthUrl } from './telegram-oidc-url';

export interface TelegramOidcStartResult {
  /** Поле `Set-Cookie` заявки (`telegram_oauth`). */
  cookie: string;
  /** Куда отправить вкладку — `oauth.telegram.org/auth?…`. */
  url: string;
}

export interface TelegramOidcLoginResult {
  user: UserLean;
  /** Поля `Set-Cookie` сессии — AuthService.issueSession. */
  cookies: string[];
}

const VERIFIER_BYTES = 32;
const STATE_BYTES = 32;

@Injectable()
export class TelegramOidcService {
  private readonly logger = new Logger(TelegramOidcService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly tokenClient: TelegramOidcTokenClient,
    private readonly usersService: UsersService,
    private readonly authService: AuthService,
    private readonly loginIdentity: LoginIdentityService,
  ) {}

  /** Тот же признак, что решает `start`/`login`, — для `telegramOidcEnabled` в
   * GET /auth/config: кнопка не расходится с тем, что сервер сделает по нажатию. */
  isEnabled(): boolean {
    return telegramOidcConfig(this.config) !== null;
  }

  /** `joinCode` — query `?join=<код>` (INVITE_QUERY_PARAM): едет в cookie
   * только если похож на код приглашения, мусор молча отбрасывается;
   * действительность кода проверит LoginIdentityService при входе. */
  start(joinCode: string | undefined): TelegramOidcStartResult {
    const oidcConfig = this.requireConfig();
    const state = randomUrlSafe(STATE_BYTES);
    const verifier = randomUrlSafe(VERIFIER_BYTES);
    // typeof: повторный `?join=a&join=b` Express отдаёт массивом, а RegExp.test
    // приводит его к строке — без проверки типа массив уехал бы в cookie.
    const join =
      typeof joinCode === 'string' && INVITE_CODE_RE.test(joinCode)
        ? joinCode
        : undefined;
    const cookie = buildTelegramOAuthCookie(
      { state, verifier, join },
      { secure: this.isSecure() },
    );
    const url = buildTelegramAuthUrl(oidcConfig, {
      state,
      challenge: codeChallenge(verifier),
    });
    return { cookie, url };
  }

  async login(
    input: TelegramOidcLoginInput,
    cookieHeader: string | undefined,
    now: DateTime,
  ): Promise<TelegramOidcLoginResult> {
    const oidcConfig = this.requireConfig();
    const stored = readTelegramOAuthCookie(cookieHeader);
    if (!stored) throw this.refused('cookie telegram_oauth нет или она повреждена');
    if (!timingSafeEqualStrings(stored.state, input.state)) {
      throw this.refused('state не совпал с cookie');
    }

    const idToken = await this.tokenClient.exchange({
      code: input.code,
      verifier: stored.verifier,
      config: oidcConfig,
    });
    if (!idToken) throw new UnauthorizedError(TELEGRAM_LOGIN_FAILED_MESSAGE);

    const identity = this.parseIdentity(idToken, oidcConfig, now);
    const user = await this.loginIdentity.resolveTelegramUser(
      identity.telegramId,
      identity.name,
      stored.join,
      now,
    );
    if (user.status === 'blocked') throw new ForbiddenError(ACCESS_MESSAGE);

    await this.usersService.touchLogin(user.id, now);
    const { cookies } = this.authService.issueSession(user.id, now);
    return { user, cookies };
  }

  private parseIdentity(
    idToken: string,
    oidcConfig: TelegramOidcConfig,
    now: DateTime,
  ): TelegramOidcIdentity {
    try {
      return parseTelegramIdToken(idToken, { clientId: oidcConfig.clientId, now });
    } catch (err) {
      this.logger.error(`id_token не прошёл проверку: ${errorMessage(err)}`);
      throw new UnauthorizedError(TELEGRAM_LOGIN_FAILED_MESSAGE);
    }
  }

  /** Отказ до обращения к Telegram: пользователю один текст на все причины
   * (SECURITY §2), причина — в лог, чтобы «страница вернулась, а вход не
   * случился» можно было разобрать по requestId (RUNBOOK §5). */
  private refused(reason: string): UnauthorizedError {
    this.logger.warn(`Вход через Telegram отклонён: ${reason}`);
    return new UnauthorizedError(TELEGRAM_LOGIN_FAILED_MESSAGE);
  }

  private requireConfig(): TelegramOidcConfig {
    const oidcConfig = telegramOidcConfig(this.config);
    if (!oidcConfig) throw new NotAvailableError(TELEGRAM_OIDC_NOT_AVAILABLE_MESSAGE);
    return oidcConfig;
  }

  private isSecure(): boolean {
    return this.config.get<NodeEnv>('NODE_ENV') === 'production';
  }
}
