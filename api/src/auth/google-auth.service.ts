// Вход через Google (ADR-0145, authorization code + PKCE, SECURITY §2).
// GoogleTokenClient — обмен code→id_token; google-id-token.ts — проверка
// claims без проверки подписи (см. комментарий там же, почему это
// безопасно); GoogleLoginIdentityService (users/) — поиск/связка/создание
// человека по правилам ADR-0145. AuthService.issueSession — тот же узел
// выпуска cookie сессии, что у Telegram/email-входа (ADR-0012).
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { DateTime } from 'luxon';
import {
  ACCESS_MESSAGE,
  GOOGLE_LOGIN_FAILED_MESSAGE,
  GOOGLE_LOGIN_NOT_AVAILABLE_MESSAGE,
  INVITE_CODE_RE,
  type GoogleLoginInput,
} from '@xuanxue/shared';
import type { NodeEnv } from '../config/env.validation';
import { errorMessage } from '../common/error-info';
import { ForbiddenError, NotAvailableError, UnauthorizedError } from '../common/errors';
import { GoogleLoginIdentityService } from '../users/google-login-identity.service';
import { UsersService, type UserLean } from '../users/users.service';
import { AuthService } from './auth.service';
import { buildGoogleAuthUrl } from './google-auth-url';
import { parseGoogleIdToken } from './google-id-token';
import { googleOAuthConfig, type GoogleOAuthConfig } from './google-login-config';
import {
  buildGoogleOAuthCookie,
  readGoogleOAuthCookie,
  type GoogleOAuthCookiePayload,
} from './google-oauth-cookie';
import {
  codeChallenge,
  randomUrlSafe,
  timingSafeEqualStrings,
} from './google-oauth-pkce';
import { GoogleTokenClient } from './google-token-client';

export interface GoogleAuthStart {
  cookie: string;
  url: string;
}

export interface GoogleLoginResult {
  user: UserLean;
  cookie: string;
}

const VERIFIER_BYTES = 32;
const STATE_BYTES = 32;
const NONCE_BYTES = 16;

@Injectable()
export class GoogleAuthService {
  private readonly logger = new Logger(GoogleAuthService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly tokenClient: GoogleTokenClient,
    private readonly usersService: UsersService,
    private readonly authService: AuthService,
    private readonly identityService: GoogleLoginIdentityService,
  ) {}

  isEnabled(): boolean {
    return googleOAuthConfig(this.config) !== null;
  }

  /** `joinCode` — query `?join=<code>` у `GET /auth/google/start`
   * (INVITE_QUERY_PARAM, как у Telegram): формат проверяется здесь, сама
   * валидность (существует ли такая ссылка) — позже, в GoogleLoginIdentityService,
   * когда известно, что человек новый (ADR-0036: код нужен только новому). */
  start(joinCode: string | undefined): GoogleAuthStart {
    const oauthConfig = this.requireConfig();
    const state = randomUrlSafe(STATE_BYTES);
    const verifier = randomUrlSafe(VERIFIER_BYTES);
    const nonce = randomUrlSafe(NONCE_BYTES);
    const join = joinCode && INVITE_CODE_RE.test(joinCode) ? joinCode : undefined;

    const cookie = buildGoogleOAuthCookie(
      { state, verifier, nonce, join },
      { secure: this.isSecure() },
    );
    const url = buildGoogleAuthUrl(oauthConfig, {
      state,
      nonce,
      challenge: codeChallenge(verifier),
    });
    return { cookie, url };
  }

  async login(
    input: GoogleLoginInput,
    cookieHeader: string | undefined,
    now: DateTime,
  ): Promise<GoogleLoginResult> {
    const oauthConfig = this.requireConfig();
    const stored = readGoogleOAuthCookie(cookieHeader);
    if (!stored) throw new UnauthorizedError(GOOGLE_LOGIN_FAILED_MESSAGE);
    if (!timingSafeEqualStrings(stored.state, input.state)) {
      throw new UnauthorizedError(GOOGLE_LOGIN_FAILED_MESSAGE);
    }

    const idToken = await this.tokenClient.exchange({
      code: input.code,
      verifier: stored.verifier,
      config: oauthConfig,
    });
    if (!idToken) throw new UnauthorizedError(GOOGLE_LOGIN_FAILED_MESSAGE);

    const identity = this.parseIdentity(idToken, oauthConfig, stored, now);
    const user = await this.identityService.resolveGoogleUser(identity, stored.join, now);
    if (user.status === 'blocked') throw new ForbiddenError(ACCESS_MESSAGE);

    await this.usersService.touchLogin(user.id, now);
    const { cookie } = this.authService.issueSession(user.id, now);
    return { user, cookie };
  }

  private parseIdentity(
    idToken: string,
    oauthConfig: GoogleOAuthConfig,
    stored: GoogleOAuthCookiePayload,
    now: DateTime,
  ) {
    try {
      return parseGoogleIdToken(idToken, {
        clientId: oauthConfig.clientId,
        nonce: stored.nonce,
        now,
      });
    } catch (err) {
      this.logger.error(`id_token не прошёл проверку: ${errorMessage(err)}`);
      throw new UnauthorizedError(GOOGLE_LOGIN_FAILED_MESSAGE);
    }
  }

  private requireConfig(): GoogleOAuthConfig {
    const oauthConfig = googleOAuthConfig(this.config);
    if (!oauthConfig) throw new NotAvailableError(GOOGLE_LOGIN_NOT_AVAILABLE_MESSAGE);
    return oauthConfig;
  }

  private isSecure(): boolean {
    return this.config.get<NodeEnv>('NODE_ENV') === 'production';
  }
}
