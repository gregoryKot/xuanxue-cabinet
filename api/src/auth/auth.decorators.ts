// Декораторы для AuthGuard (SetMetadata читается через Reflector) и
// извлечения текущего пользователя (@CurrentUser в сигнатуре контроллера).
// SkipCsrf() ждёт своего первого потребителя (вебхук Telegram) — сам ключ
// (SKIP_CSRF_KEY) уже читает гвард, метаданные пока проставляют только тесты
// напрямую через фейковый Reflector.
import { createParamDecorator, SetMetadata, type ExecutionContext } from '@nestjs/common';
import type { UserRole } from '@xuanxue/shared';
import type { UserLean } from '../users/users.service';
import type { RequestLike } from './http-like';

export const IS_PUBLIC_KEY = 'isPublic';
/** Маршрут доступен без сессии (сейчас — /api/health и /auth/logout). CSRF на
 * мутирующие методы это не отменяет, см. csrf.ts. */
export const Public = (): ReturnType<typeof SetMetadata> =>
  SetMetadata(IS_PUBLIC_KEY, true);

export const SKIP_CSRF_KEY = 'skipCsrf';
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
