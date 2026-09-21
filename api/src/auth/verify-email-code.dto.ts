// Тело POST /auth/email/code — второй способ потратить ту же заявку на вход,
// что и ссылка (ADR-0104): код из письма, который человек переносит руками в
// то окно, которое письмо и запросило (СЮАНЬ-СЮЭ, приложение на домашнем
// экране айфона со своими cookie). `email` — тот адрес, на который ушло
// письмо: заявка ищется по нему, шесть цифр не уникальны на всю школу.
// `inviteCode` — код ссылки-приглашения школы (ADR-0030/0036), как и у входа
// по ссылке.
import { IsEmail, IsOptional, Matches, MaxLength } from 'class-validator';
import {
  EMAIL_LOGIN_CODE_INVALID_MESSAGE,
  EMAIL_LOGIN_CODE_RE,
  INVITE_CODE_RE,
  type VerifyEmailCodeInput,
} from '@xuanxue/shared';
import { EMAIL_MAX_LENGTH } from './request-email-login.dto';

const INVALID_INVITE_CODE_MESSAGE = 'Ссылка повреждена. Скопируйте её ещё раз.';

export class VerifyEmailCodeDto implements VerifyEmailCodeInput {
  @IsEmail()
  @MaxLength(EMAIL_MAX_LENGTH)
  email!: string;

  @Matches(EMAIL_LOGIN_CODE_RE, { message: EMAIL_LOGIN_CODE_INVALID_MESSAGE })
  code!: string;

  @IsOptional()
  @Matches(INVITE_CODE_RE, { message: INVALID_INVITE_CODE_MESSAGE })
  inviteCode?: string;
}
