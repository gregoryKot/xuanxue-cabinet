// Глобальный APP_GUARD сессии (ADR-0012, SECURITY §2), регистрируется в
// AuthModule. Провайдеры AppModule (ThrottlerGuard) сканируются раньше
// провайдеров импортированных модулей (@nestjs/core scanner) — порядок
// ThrottlerGuard → AuthGuard держится сам, переносить регистрацию не нужно.
//
// Порядок проверок строго фиксирован:
//   (a) @AllowNativeBearer(): заголовок Authorization вместе с живой cookie —
//       400 ambiguous_credentials; Authorization без живой cookie — bearer
//       (bearer-credential.ts, ADR-0185); без Authorization — cookie. Без метки
//       Authorization не читается вовсе;
//   (b) мутирующий метод без @SkipCsrf() → требует x-requested-with, для
//       всех, включая @Public(); кроме запроса по bearer: CSRF защищает cookie,
//       а bearer браузер сам не подставляет (ADR-0185);
//   (c) @Public() → пропускает без сессии;
//   (d) cookie → AuthService.verifyCookieHeader → UsersService.findById →
//       blocked → actingUser (режим ученика, ADR-0163) → @Roles; bearer
//       приходит к actingUser и @Roles с уже найденным человеком;
//   (e) rolling-перевыпуск cookie, если токену больше SESSION_RENEW_AFTER_DAYS;
//       с @RenewActiveCookieOnly() — одно поле, действующая cookie профиля.
//       Bearer cookie не ставит и не продлевает.
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DateTime } from 'luxon';
import { ACCESS_MESSAGE, isMutatingMethod, type UserRole } from '@xuanxue/shared';
import {
  AmbiguousCredentialsError,
  ForbiddenError,
  UnauthorizedError,
} from '../common/errors';
import {
  asSingleHeader,
  type RequestLike,
  type ResponseLike,
} from '../common/http-headers';
import { NativeGrantsService } from '../native-auth/native-grants.service';
import { actingUser } from '../users/student-mode';
import { UsersService, type UserLean } from '../users/users.service';
import {
  ALLOW_NATIVE_BEARER_KEY,
  IS_PUBLIC_KEY,
  RENEW_ACTIVE_COOKIE_ONLY_KEY,
  ROLES_KEY,
  SKIP_CSRF_KEY,
} from './auth.decorators';
import { AuthService } from './auth.service';
import {
  SESSION_MESSAGE,
  authenticateBearer,
  hasAuthorizationHeader,
} from './bearer-credential';
import { hasCsrfHeader } from './csrf';
import { shouldRenew } from './session-renewal';

const CSRF_MESSAGE = 'Страница устарела. Обновите её и попробуйте ещё раз.';
const AMBIGUOUS_MESSAGE =
  'Запрос пришёл сразу с входом в браузере и с доступом приложения. Оставьте что-то одно и повторите.';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly usersService: UsersService,
    private readonly authService: AuthService,
    private readonly nativeGrants: NativeGrantsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const request = http.getRequest<RequestLike>();
    const response = http.getResponse<ResponseLike>();

    const now = DateTime.utc();
    const payload = this.authService.verifyCookieHeader(
      asSingleHeader(request.headers.cookie),
      now,
    );
    const viaBearer =
      this.metadata<boolean>(context, ALLOW_NATIVE_BEARER_KEY) === true &&
      hasAuthorizationHeader(request);
    if (viaBearer && payload) throw new AmbiguousCredentialsError(AMBIGUOUS_MESSAGE);

    if (
      isMutatingMethod(request.method) &&
      !this.metadata<boolean>(context, SKIP_CSRF_KEY) &&
      !viaBearer
    ) {
      if (!hasCsrfHeader(request.headers)) throw new ForbiddenError(CSRF_MESSAGE);
    }

    if (this.metadata<boolean>(context, IS_PUBLIC_KEY)) return true;

    const user = viaBearer
      ? await authenticateBearer(this.nativeGrants, request, now)
      : await this.cookieUser(payload?.sub);

    // Режим ученика (ADR-0163): настоящие роли остаются в БД, а решение о доступе
    // и request.user получают действующие — пустые, пока режим включён. Только
    // сужение: из ролей `[]` получается `[]`, прибавить нечего (SECURITY §2).
    const acting = actingUser(user);
    const required = this.metadata<UserRole[]>(context, ROLES_KEY);
    if (
      required &&
      required.length > 0 &&
      !required.some((r) => acting.roles.includes(r))
    ) {
      throw new ForbiddenError(ACCESS_MESSAGE);
    }

    request.user = acting;
    if (payload && shouldRenew(payload, now)) {
      response.setHeader('Set-Cookie', this.renewalCookies(context, user.id, now));
    }
    return true;
  }

  private async cookieUser(userId: string | undefined): Promise<UserLean> {
    if (!userId) throw new UnauthorizedError(SESSION_MESSAGE);
    const user = await this.usersService.findById(userId);
    if (!user) throw new UnauthorizedError(SESSION_MESSAGE);
    if (user.status === 'blocked') throw new ForbiddenError(ACCESS_MESSAGE);
    return user;
  }

  private renewalCookies(
    context: ExecutionContext,
    userId: string,
    now: DateTime,
  ): string[] {
    if (this.metadata<boolean>(context, RENEW_ACTIVE_COOKIE_ONLY_KEY)) {
      return [this.authService.activeSessionCookie(userId, now)];
    }
    return this.authService.issueSession(userId, now).cookies;
  }

  private metadata<T>(context: ExecutionContext, key: string): T | undefined {
    return this.reflector.getAllAndOverride<T>(key, [
      context.getHandler(),
      context.getClass(),
    ]);
  }
}
