// Проверка браузерной сессии для бэкенда Daychi (ADR-0183, контракт Workshop
// web-wiki-session): он зовёт GET /api/auth/session с одной cookie сессии и
// решает, пускать ли читателя в wiki. Веб сюда не ходит, поэтому без @ApiRoute.
//
// Ответы: 204 без тела — сессия живая, аккаунт есть и не заблокирован (профиль
// аккаунта наружу не отдаётся); 401 — сессии нет, она битая, просрочена, cookie
// продублирована или аккаунт удалён; 403 — аккаунт заблокирован; 429 — лимит
// троттлера. Все правила проверки — у AuthGuard, второй копии здесь нет.
//
// `no-store` ставит middleware, а не контроллер: 401/403/429 пишет глобальный
// фильтр, не доходя до обработчика, а контракт требует no-store на любом
// ответе проверки — кэшированный ответ решал бы доступ по прошлой сессии.
//
// Продление (@RenewActiveCookieOnly) отдаёт только действующую cookie: ответ
// читает бэкенд Daychi и передаёт браузеру одну cookie сессии, а уборка прежней
// host-only `session` принадлежит ответам самого кабинета браузеру.
import { Controller, Get, HttpCode, HttpStatus } from '@nestjs/common';
import type { ResponseLike } from '../common/http-headers';
import { RenewActiveCookieOnly } from './auth.decorators';

/** Ответ типизирован через ResponseLike: `@types/express` в api нет. */
export function setNoStoreMiddleware(
  _request: unknown,
  response: ResponseLike,
  next: () => void,
): void {
  response.setHeader('Cache-Control', 'no-store');
  next();
}

@Controller('auth')
export class SessionCheckController {
  @RenewActiveCookieOnly()
  @Get('session')
  @HttpCode(HttpStatus.NO_CONTENT)
  check(): void {
    // Тело пустое: всё решил AuthGuard до этого обработчика.
  }
}
