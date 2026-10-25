// Декораторы для AuthGuard (SetMetadata читается через Reflector) и
// извлечения текущего пользователя (@CurrentUser в сигнатуре контроллера).
import { createParamDecorator, SetMetadata, type ExecutionContext } from '@nestjs/common';
import type { UserRole } from '@xuanxue/shared';
import type { UserLean } from '../users/users.service';
import type { RequestLike } from '../common/http-headers';

export const IS_PUBLIC_KEY = 'isPublic';
/** Маршрут доступен без сессии (сейчас — /api/health и /auth/logout). CSRF на
 * мутирующие методы это не отменяет, см. csrf.ts. */
export const Public = (): ReturnType<typeof SetMetadata> =>
  SetMetadata(IS_PUBLIC_KEY, true);

export const SKIP_CSRF_KEY = 'skipCsrf';
/** Мутирующий запрос обходится без `x-requested-with` — единственный
 * потребитель — вебхук Telegram: подлинность запроса подтверждает
 * `secret_token` (TelegramWebhookGuard), а не CSRF-заголовок, который
 * Telegram всё равно не пришлёт (SECURITY §2). */
export const SkipCsrf = (): ReturnType<typeof SetMetadata> =>
  SetMetadata(SKIP_CSRF_KEY, true);

export const RENEW_ACTIVE_COOKIE_ONLY_KEY = 'renewActiveCookieOnly';
/** Продление сессии на этом маршруте отдаёт одно поле `Set-Cookie` — действующую
 * cookie профиля, без уборки прежней host-only `session`. Ответ уходит на
 * бэкенд Daychi, а он передаёт браузеру только cookie сессии; уборка host-only
 * относится к ответам самого кабинета браузеру (ADR-0183, контракт Workshop
 * web-wiki-session). */
export const RenewActiveCookieOnly = (): ReturnType<typeof SetMetadata> =>
  SetMetadata(RENEW_ACTIVE_COOKIE_ONLY_KEY, true);

export const ALLOW_NATIVE_BEARER_KEY = 'allowNativeBearer';
/** Маршрут принимает вместо cookie сессии bearer приложения Daychi (ADR-0185).
 * Без метки заголовок Authorization гвард не читает вовсе — ни один другой
 * маршрут кабинета bearer не открывает (SECURITY §2). */
export const AllowNativeBearer = (): ReturnType<typeof SetMetadata> =>
  SetMetadata(ALLOW_NATIVE_BEARER_KEY, true);

export const ROLES_KEY = 'roles';
/** Маршрут виден только сессии хотя бы с одной из перечисленных ролей
 * (ADR-0010: данные школы — по роли, не по владельцу). Первый потребитель —
 * `ClassesController`. */
export const Roles = (...roles: UserRole[]): ReturnType<typeof SetMetadata> =>
  SetMetadata(ROLES_KEY, roles);

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): UserLean => {
    const request = ctx.switchToHttp().getRequest<RequestLike>();
    if (!request.user) {
      // Маршрут без AuthGuard перед контроллером — программная ошибка
      // конфигурации, не пользовательский случай, поэтому не DomainError.
      throw new Error('@CurrentUser() использован на маршруте без AuthGuard');
    }
    return request.user;
  },
);
