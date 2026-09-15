// Тело POST /auth/email/verify — токен из ссылки (SECURITY §2): 64 hex-
// символа, формат randomBytes(32).toString('hex') (email-login-token.service.ts).
import { Matches } from 'class-validator';
import type { VerifyEmailLoginInput } from '@xuanxue/shared';
import { EMAIL_LOGIN_TOKEN_RE } from './email-login-token.service';

export class VerifyEmailLoginDto implements VerifyEmailLoginInput {
  @Matches(EMAIL_LOGIN_TOKEN_RE, {
    message: 'Ссылка повреждена. Скопируйте её из письма ещё раз.',
  })
  token!: string;
}
