// Фейковый MailService для e2e без сети (auth-email-resend.e2e-spec.ts,
// email-link.e2e-spec.ts) — подменяется через `overrides` createTestApp()
// (create-app.ts, тот же приём, что у fake-telegram-client.ts). Токен в
// письме — единственный способ теста добраться до сырого токена (в базе
// только его хеш, SECURITY §2): тест берёт его из перехваченной ссылки, как
// это сделал бы человек, открывший письмо. `sentConfirm` — отдельный список
// для sendEmailConfirmLink (ADR-0059): тест не должен путать письмо входа с
// письмом подтверждения привязки почты.
import type { MailService } from '../../src/mail/mail.service';

interface SentLoginLink {
  to: string;
  link: string;
}

export interface FakeMailService {
  service: MailService;
  sent: SentLoginLink[];
  sentConfirm: SentLoginLink[];
}

export function createFakeMailService(): FakeMailService {
  const sent: SentLoginLink[] = [];
  const sentConfirm: SentLoginLink[] = [];
  const service = {
    sendLoginLink: (input: SentLoginLink) => {
      sent.push(input);
      return Promise.resolve();
    },
    sendEmailConfirmLink: (input: SentLoginLink) => {
      sentConfirm.push(input);
      return Promise.resolve();
    },
  } as unknown as MailService;
  return { service, sent, sentConfirm };
}

/** Токен из ссылки `.../login/email?token=<64hex>` или
 * `.../email/confirm?token=<64hex>`, перехваченной фейком — оба используют
 * один и тот же query-параметр. */
export function tokenFromLink(link: string): string {
  return new URL(link).searchParams.get('token') ?? '';
}
