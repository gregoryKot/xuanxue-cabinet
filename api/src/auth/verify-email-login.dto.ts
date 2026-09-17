// Тело POST /auth/email/verify — токен из ссылки (SECURITY §2): 64 hex-
// символа, формат randomBytes(32).toString('hex') (email-login-token.service.ts).
// inviteCode — код ссылки-приглашения школы (ADR-0030/0035), страница
// `/login/email` читает его из query `?join=<code>` и шлёт вместе с verify.
import { IsOptional, Matches } from 'class-validator';
import { INVITE_CODE_RE, type VerifyEmailLoginInput } from '@xuanxue/shared';
import { EMAIL_LOGIN_TOKEN_RE } from './email-login-token.service';

const INVALID_INVITE_CODE_MESSAGE = 'Ссылка повреждена. Скопируйте её ещё раз.';

export class VerifyEmailLoginDto implements VerifyEmailLoginInput {
  @Matches(EMAIL_LOGIN_TOKEN_RE, {
    message: 'Ссылка повреждена. Скопируйте её из письма ещё раз.',
  })
  token!: string;

  @IsOptional()
  @Matches(INVITE_CODE_RE, { message: INVALID_INVITE_CODE_MESSAGE })
  inviteCode?: string;
}
