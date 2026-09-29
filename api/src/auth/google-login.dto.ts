// Тело POST /auth/google — то, что Google вернул адресом на
// /login/google?code=…&state=… (SECURITY §2): форматы — общий контракт
// shared/src/google-login.ts, DTO их же проверяет декоратором.
import { Matches } from 'class-validator';
import {
  GOOGLE_LOGIN_FAILED_MESSAGE,
  GOOGLE_OAUTH_CODE_RE,
  GOOGLE_OAUTH_STATE_RE,
  type ApiRouteBody,
} from '@xuanxue/shared';

export class GoogleLoginDto implements ApiRouteBody<'POST /auth/google'> {
  @Matches(GOOGLE_OAUTH_CODE_RE, { message: GOOGLE_LOGIN_FAILED_MESSAGE })
  code!: string;

  @Matches(GOOGLE_OAUTH_STATE_RE, { message: GOOGLE_LOGIN_FAILED_MESSAGE })
  state!: string;
}
