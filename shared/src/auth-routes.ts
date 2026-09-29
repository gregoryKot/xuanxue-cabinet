// Записи карты маршрутов (api-routes.ts, ADR-0148) — вход, сессия и связки
// ключей входа. Всё, что создаёт или возвращает сессию, отдаёт `MeDto` — тот
// же, что `GET /auth/me`: кабинет кладёт его на экран без второго запроса
// (ADR-0087; `POST /auth/email/link` в #345 отдавал 204, и «Профиль» не видел
// появившийся `pendingEmail`). Публичные маршруты (`@Public()`) стоят рядом с
// сессионными: ключ карты не различает, кто вправе позвать.
//
// Мимо карты — `GET /auth/google/start`: его открывает браузер переходом
// (302 на Google), а не `apiFetch`.
import type {
  AuthConfigDto,
  RequestEmailLoginInput,
  TelegramLoginInput,
  VerifyEmailLoginInput,
} from './auth';
import type { ConfirmEmailInput, LinkEmailInput } from './email-link';
import type { VerifyEmailCodeInput } from './email-login-code';
import type { GoogleLoginInput } from './google-login';
import type {
  CheckInviteResultDto,
  INVITE_QUERY_PARAM,
  JoinByInviteInput,
} from './invite-link';
import type { MeDto } from './me';
import type { TelegramLinkCodeDto } from './telegram-link';

/** Код ссылки-приглашения едет в query, а не в теле: подпись Telegram
 * считается по телу целиком, лишнее поле её сломало бы (ADR-0030/0036). */
interface TelegramLoginQuery {
  [INVITE_QUERY_PARAM]?: string;
}

export interface AuthRoutes {
  'GET /auth/config': { query: undefined; body: undefined; response: AuthConfigDto };
  'GET /auth/me': { query: undefined; body: undefined; response: MeDto };
  'POST /auth/telegram': {
    query: TelegramLoginQuery;
    body: TelegramLoginInput;
    response: MeDto;
  };
  'POST /auth/email/request': {
    query: undefined;
    body: RequestEmailLoginInput;
    response: void;
  };
  'POST /auth/email/verify': {
    query: undefined;
    body: VerifyEmailLoginInput;
    response: MeDto;
  };
  'POST /auth/email/code': {
    query: undefined;
    body: VerifyEmailCodeInput;
    response: MeDto;
  };
  'POST /auth/email/link': { query: undefined; body: LinkEmailInput; response: MeDto };
  'POST /auth/email/confirm': {
    query: undefined;
    body: ConfirmEmailInput;
    response: void;
  };
  'POST /auth/google': { query: undefined; body: GoogleLoginInput; response: MeDto };
  'POST /auth/join/check': {
    query: undefined;
    body: JoinByInviteInput;
    response: CheckInviteResultDto;
  };
  'POST /auth/telegram/link-code': {
    query: undefined;
    body: undefined;
    response: TelegramLinkCodeDto;
  };
  'POST /auth/logout': { query: undefined; body: undefined; response: void };
}

export const AUTH_ROUTE_KEYS: Record<keyof AuthRoutes, true> = {
  'GET /auth/config': true,
  'GET /auth/me': true,
  'POST /auth/telegram': true,
  'POST /auth/email/request': true,
  'POST /auth/email/verify': true,
  'POST /auth/email/code': true,
  'POST /auth/email/link': true,
  'POST /auth/email/confirm': true,
  'POST /auth/google': true,
  'POST /auth/join/check': true,
  'POST /auth/telegram/link-code': true,
  'POST /auth/logout': true,
};
