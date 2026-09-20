// Тело POST /auth/email/confirm — токен из ссылки в письме (ADR-0059): 64
// hex-символов, формат randomBytes(32).toString('hex')
// (../users/email-link-token.service.ts) — тот же приём, что у токена входа
// (VerifyEmailLoginDto), но другое хранилище (email-link-token.schema.ts).
import { Matches } from 'class-validator';
import { EMAIL_CONFIRM_TOKEN_RE, type ConfirmEmailInput } from '@xuanxue/shared';

export class ConfirmEmailDto implements ConfirmEmailInput {
  @Matches(EMAIL_CONFIRM_TOKEN_RE, {
    message: 'Ссылка повреждена. Скопируйте её из письма ещё раз.',
  })
  token!: string;
}
