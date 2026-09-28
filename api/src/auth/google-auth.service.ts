// Вход через Google (ADR-0145, authorization code + PKCE, SECURITY §2) и
// привязка Google к уже вошедшему человеку из профиля (`intent=link`,
// ADR-0145). GoogleTokenClient — обмен code→id_token; google-id-token.ts —
// проверка claims без проверки подписи (см. комментарий там же, почему это
// безопасно); GoogleLoginIdentityService (users/) — поиск/связка/создание
// человека при входе; GoogleLinkService (users/) — привязка из профиля, не
// слияние (ADR-0034). AuthService.issueSession — тот же узел выпуска cookie
// сессии, что у Telegram/email-входа (ADR-0012); при привязке новую сессию
// не выпускаем вовсе — тот же принцип, что у EmailLinkService (ADR-0059).
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { DateTime } from 'luxon';
import {
  ACCESS_MESSAGE,
  GOOGLE_LINK_INTENT,
  GOOGLE_LINK_SESSION_MESSAGE,
  GOOGLE_LOGIN_FAILED_MESSAGE,
  GOOGLE_LOGIN_NOT_AVAILABLE_MESSAGE,
  INVITE_CODE_RE,
  type GoogleLoginInput,
} from '@xuanxue/shared';
import type { NodeEnv } from '../config/env.validation';
import { errorMessage } from '../common/error-info';
import { ForbiddenError, NotAvailableError, UnauthorizedError } from '../common/errors';
import { GoogleLinkService } from '../users/google-link.service';
import type { GoogleIdentity } from '../users/google-login-identity.service';
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
import { findSessionUser } from './session-user';

export interface GoogleAuthStartParams {
  /** Query `?join=<code>` — игнорируется при `intent: 'link'` (ADR-0145: код
   * приглашения нужен только новому человеку, у привязки его нет вовсе). */
  joinCode?: string;
  /** Query `?intent=link` (`GOOGLE_INTENT_QUERY_PARAM`) — начать не вход, а
   * привязку Google к уже открытой сессии («Профиль»). */
  intent?: string;
}

/** `oauth` — обычный переход на Google; `no-session` — `intent=link` без
 * валидной сессии: вкладка вместо Google идёт на `${PUBLIC_URL}/login`,
 * cookie `google_oauth` не ставится вовсе (нечего запоминать). */
export type GoogleAuthStartResult =
  | { kind: 'oauth'; cookie: string; url: string }
  | { kind: 'no-session'; url: string };

export interface GoogleLoginResult {
  user: UserLean;
  /** Новая cookie сессии — только для входа. Привязка (`intent=link`) её не
   * выпускает: пользователь и так вошёл, тем самым токеном (ADR-0059). */
  cookie?: string;
}

const VERIFIER_BYTES = 32;
const STATE_BYTES = 32;
const NONCE_BYTES = 16;
// Страница входа кабинета (web/src/app/routeModules.ts) — сюда уходит
// вкладка, если `intent=link` начали без сессии (протухла между открытием
// «Профиля» и переходом на Google).
const LOGIN_PATH = '/login';

@Injectable()
export class GoogleAuthService {
  private readonly logger = new Logger(GoogleAuthService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly tokenClient: GoogleTokenClient,
    private readonly usersService: UsersService,
    private readonly authService: AuthService,
    private readonly identityService: GoogleLoginIdentityService,
    private readonly linkService: GoogleLinkService,
  ) {}

  isEnabled(): boolean {
    return googleOAuthConfig(this.config) !== null;
  }

  async start(
    params: GoogleAuthStartParams,
    sessionCookieHeader: string | undefined,
    now: DateTime,
  ): Promise<GoogleAuthStartResult> {
    const oauthConfig = this.requireConfig();

    if (params.intent === GOOGLE_LINK_INTENT) {
      const sessionUser = await findSessionUser(
        sessionCookieHeader,
        this.authService,
        this.usersService,
        now,
      );
      if (!sessionUser || sessionUser.status === 'blocked') {
        return { kind: 'no-session', url: `${oauthConfig.publicUrl}${LOGIN_PATH}` };
      }
      return {
        kind: 'oauth',
        ...this.buildStart(oauthConfig, {
          intent: GOOGLE_LINK_INTENT,
          userId: sessionUser.id,
        }),
      };
    }

    const join =
      params.joinCode && INVITE_CODE_RE.test(params.joinCode)
        ? params.joinCode
        : undefined;
    return { kind: 'oauth', ...this.buildStart(oauthConfig, { join }) };
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

    if (stored.intent === GOOGLE_LINK_INTENT) {
      return this.completeLink(identity, stored, cookieHeader, now);
    }

    const user = await this.identityService.resolveGoogleUser(identity, stored.join, now);
    if (user.status === 'blocked') throw new ForbiddenError(ACCESS_MESSAGE);

    await this.usersService.touchLogin(user.id, now);
    const { cookie } = this.authService.issueSession(user.id, now);
    return { user, cookie };
  }

  /** `intent=link`: сверяем сессию САМОГО этого запроса (не тело — тело не
   * подписано) с userId, который `start()` положил в cookie google_oauth
   * (ADR-0145). Не совпало или сессии нет вовсе — 401, отдельным текстом от
   * обычного отказа входа: причина другая, действие другое («войдите ещё
   * раз»), SECURITY §2. */
  private async completeLink(
    identity: GoogleIdentity,
    stored: GoogleOAuthCookiePayload,
    cookieHeader: string | undefined,
    now: DateTime,
  ): Promise<GoogleLoginResult> {
    const sessionUser = await findSessionUser(
      cookieHeader,
      this.authService,
      this.usersService,
      now,
    );
    if (!sessionUser || sessionUser.id !== stored.userId) {
      throw new UnauthorizedError(GOOGLE_LINK_SESSION_MESSAGE);
    }
    if (sessionUser.status === 'blocked') throw new ForbiddenError(ACCESS_MESSAGE);

    const user = await this.linkService.link(sessionUser, identity);
    return { user };
  }

  private buildStart(
    oauthConfig: GoogleOAuthConfig,
    extra: Pick<GoogleOAuthCookiePayload, 'join' | 'intent' | 'userId'>,
  ): { cookie: string; url: string } {
    const state = randomUrlSafe(STATE_BYTES);
    const verifier = randomUrlSafe(VERIFIER_BYTES);
    const nonce = randomUrlSafe(NONCE_BYTES);
    const cookie = buildGoogleOAuthCookie(
      { state, verifier, nonce, ...extra },
      { secure: this.isSecure() },
    );
    const url = buildGoogleAuthUrl(oauthConfig, {
      state,
      nonce,
      challenge: codeChallenge(verifier),
    });
    return { cookie, url };
  }

  private parseIdentity(
    idToken: string,
    oauthConfig: GoogleOAuthConfig,
    stored: GoogleOAuthCookiePayload,
    now: DateTime,
  ): GoogleIdentity {
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
