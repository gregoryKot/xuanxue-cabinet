// Тело POST /auth/email/request (ADR-0005, ADR-0029). Длина — практический
// потолок email из RFC 5321 §4.5.3.1.3 (254 символа).
import { IsEmail, MaxLength } from 'class-validator';
import type { RequestEmailLoginInput } from '@xuanxue/shared';

const EMAIL_MAX_LENGTH = 254;

export class RequestEmailLoginDto implements RequestEmailLoginInput {
  @IsEmail()
  @MaxLength(EMAIL_MAX_LENGTH)
  email!: string;
}
