// Глобальный APP_GUARD сессии (ADR-0012, SECURITY §2), регистрируется в
// AuthModule. Провайдеры AppModule (ThrottlerGuard) сканируются раньше
// провайдеров импортированных модулей (@nestjs/core scanner) — порядок
// ThrottlerGuard → AuthGuard держится сам, переносить регистрацию не нужно.
//
// Порядок проверок строго фиксирован:
//   (a) мутирующий метод без @SkipCsrf() → требует x-requested-with, для
//       всех, включая @Public();
//   (b) @Public() → пропускает без сессии;
//   (c) cookie → AuthService.verifySession → UsersService.findById →
//       blocked → @Roles;
//   (d) rolling-перевыпуск cookie, если токену больше SESSION_RENEW_AFTER_DAYS.
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
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import { IS_PUBLIC_KEY, ROLES_KEY, SKIP_CSRF_KEY } from './auth.decorators';
import { hasCsrfHeader } from './csrf';
import { readCookie, SESSION_COOKIE } from './session-cookie';
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
    const token = readCookie(asSingleHeader(request.headers.cookie), SESSION_COOKIE);
    const payload = token ? this.authService.verifySession(token, now) : null;
    if (!payload) throw new UnauthorizedError(SESSION_MESSAGE);

    const user = await this.usersService.findById(payload.sub);
    if (!user) throw new UnauthorizedError(SESSION_MESSAGE);
    if (user.status === 'blocked') throw new ForbiddenError(ACCESS_MESSAGE);

    const required = this.metadata<UserRole[]>(context, ROLES_KEY);
    if (
      required &&
      required.length > 0 &&
      !required.some((r) => user.roles.includes(r))
    ) {
      throw new ForbiddenError(ACCESS_MESSAGE);
    }

    request.user = user;
    if (shouldRenew(payload, now)) {
      const { cookie } = this.authService.issueSession(user.id, now);
      response.setHeader('Set-Cookie', cookie);
    }
    return true;
  }

  private metadata<T>(context: ExecutionContext, key: string): T | undefined {
    return this.reflector.getAllAndOverride<T>(key, [
      context.getHandler(),
      context.getClass(),
    ]);
  }
}
