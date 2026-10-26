// Тело POST /auth/telegram/oidc — то, что Telegram вернул адресом на
// /login/telegram?code=…&state=… (ADR-0187, SECURITY §2): форматы — общий
// контракт shared/src/telegram-oidc.ts, DTO их же проверяет декоратором. Одно
// сообщение на оба поля — человеку помогает одно и то же: начать заново.
import { Matches } from 'class-validator';
import {
  TELEGRAM_LOGIN_FAILED_MESSAGE,
  TELEGRAM_OIDC_CODE_RE,
  TELEGRAM_OIDC_STATE_RE,
  type ApiRouteBody,
} from '@xuanxue/shared';

export class TelegramOidcLoginDto implements ApiRouteBody<'POST /auth/telegram/oidc'> {
  @Matches(TELEGRAM_OIDC_CODE_RE, { message: TELEGRAM_LOGIN_FAILED_MESSAGE })
  code!: string;

  @Matches(TELEGRAM_OIDC_STATE_RE, { message: TELEGRAM_LOGIN_FAILED_MESSAGE })
  state!: string;
}
