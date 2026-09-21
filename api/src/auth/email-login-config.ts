// Проверка «email доступен конфигурацией» — три переменные разом
// (RESEND_API_KEY, MAIL_FROM, PUBLIC_URL, ADR-0029) нужны и EmailAuthService
// (форма входа, отправка ссылки), и EmailLinkService (привязка почты к
// вошедшему, ADR-0059): один список, не два (CLAUDE.md «Дубли») — иначе
// однажды переменную допишут для одного сценария и забудут для другого, и
// форма покажется доступной там, где письмо на самом деле не уйдёт.
import type { ConfigService } from '@nestjs/config';

/** `PUBLIC_URL`, только если заданы все три переменные — иначе `null`, и
 * вызывающий код сам бросает NotAvailableError (текст отличается для формы
 * входа и для привязки почты, поэтому решение об ошибке остаётся снаружи). */
export function emailLoginPublicUrl(config: ConfigService): string | null {
  const hasResendKey = Boolean(config.get<string>('RESEND_API_KEY'));
  const hasMailFrom = Boolean(config.get<string>('MAIL_FROM'));
  const publicUrl = config.get<string>('PUBLIC_URL');
  return hasResendKey && hasMailFrom && publicUrl ? publicUrl : null;
}
