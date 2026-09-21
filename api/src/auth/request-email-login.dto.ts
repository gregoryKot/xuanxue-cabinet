// Тело POST /auth/email/request (ADR-0005, ADR-0029). Длина — практический
// потолок email из RFC 5321 §4.5.3.1.3 (254 символа). inviteCode — код
// ссылки-приглашения школы (ADR-0030) со страницы /join/:code, опционален.
import { IsEmail, IsOptional, Matches, MaxLength } from 'class-validator';
import { INVITE_CODE_RE, type RequestEmailLoginInput } from '@xuanxue/shared';

// Экспортирован — тем же числом пользуется VerifyEmailCodeDto
// (verify-email-code.dto.ts): длина поля email не пишется в коде дважды.
export const EMAIL_MAX_LENGTH = 254;
const INVALID_INVITE_CODE_MESSAGE = 'Ссылка повреждена. Скопируйте её ещё раз.';

export class RequestEmailLoginDto implements RequestEmailLoginInput {
  @IsEmail()
  @MaxLength(EMAIL_MAX_LENGTH)
  email!: string;

  @IsOptional()
  @Matches(INVITE_CODE_RE, { message: INVALID_INVITE_CODE_MESSAGE })
  inviteCode?: string;
}
