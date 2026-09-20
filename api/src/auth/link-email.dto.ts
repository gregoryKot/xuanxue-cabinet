// Тело POST /auth/email/link (ADR-0059) — только адрес, владелец решается
// сессией (@CurrentUser()), не телом (SECURITY §2). Длина — практический
// потолок email из RFC 5321 §4.5.3.1.3 (254 символа), как у
// RequestEmailLoginDto.
import { IsEmail, MaxLength } from 'class-validator';
import type { LinkEmailInput } from '@xuanxue/shared';

const EMAIL_MAX_LENGTH = 254;

export class LinkEmailDto implements LinkEmailInput {
  @IsEmail()
  @MaxLength(EMAIL_MAX_LENGTH)
  email!: string;
}
