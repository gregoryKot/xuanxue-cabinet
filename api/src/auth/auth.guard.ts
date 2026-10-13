// Глобальный APP_GUARD сессии (ADR-0012, SECURITY §2), регистрируется в
// AuthModule. Провайдеры AppModule (ThrottlerGuard) сканируются раньше
// провайдеров импортированных модулей (@nestjs/core scanner) — порядок
// ThrottlerGuard → AuthGuard держится сам, переносить регистрацию не нужно.
//
// Порядок проверок строго фиксирован:
//   (a) мутирующий метод без @SkipCsrf() → требует x-requested-with, для
//       всех, включая @Public();
//   (b) @Public() → пропускает без сессии;
//   (c) cookie → AuthService.verifyCookieHeader → UsersService.findById →
//       blocked → actingUser (режим ученика, ADR-0163) → @Roles;
//   (d) rolling-перевыпуск cookie, если токену больше SESSION_RENEW_AFTER_DAYS;
//       с @RenewActiveCookieOnly() — одно поле, действующая cookie профиля.
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DateTime } from 'luxon';
import { ACCESS_MESSAGE, isMutatingMethod, type UserRole } from '@xuanxue/shared';
import { ForbiddenError, UnauthorizedError } from '../common/errors';
import {
  asSingleHeader,
  type RequestLike,
  type ResponseLike,
} from '../common/http-headers';
import { actingUser } from '../users/student-mode';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import {
  IS_PUBLIC_KEY,
  RENEW_ACTIVE_COOKIE_ONLY_KEY,
  ROLES_KEY,
  SKIP_CSRF_KEY,
} from './auth.decorators';
import { hasCsrfHeader } from './csrf';
import { shouldRenew } from './session-renewal';

const CSRF_MESSAGE = 'Страница устарела. Обновите её и попробуйте ещё раз.';
const SESSION_MESSAGE = 'Войдите, чтобы продолжить.';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly usersService: UsersService,
    private readonly authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const request = http.getRequest<RequestLike>();
    const response = http.getResponse<ResponseLike>();

    if (
      isMutatingMethod(request.method) &&
      !this.metadata<boolean>(context, SKIP_CSRF_KEY)
    ) {
      if (!hasCsrfHeader(request.headers)) throw new ForbiddenError(CSRF_MESSAGE);
    }

    if (this.metadata<boolean>(context, IS_PUBLIC_KEY)) return true;

    const now = DateTime.utc();
    const payload = this.authService.verifyCookieHeader(
      asSingleHeader(request.headers.cookie),
      now,
    );
    if (!payload) throw new UnauthorizedError(SESSION_MESSAGE);

    const user = await this.usersService.findById(payload.sub);
    if (!user) throw new UnauthorizedError(SESSION_MESSAGE);
    if (user.status === 'blocked') throw new ForbiddenError(ACCESS_MESSAGE);

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
    if (shouldRenew(payload, now)) {
      response.setHeader('Set-Cookie', this.renewalCookies(context, user.id, now));
    }
    return true;
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
