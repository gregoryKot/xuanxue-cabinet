// Фейковый MailService для e2e без сети (auth-email-resend.e2e-spec.ts) —
// подменяется через `overrides` createTestApp() (create-app.ts, тот же
// приём, что у fake-telegram-client.ts). Токен в письме — единственный
// способ теста добраться до сырого токена (в базе только его хеш, SECURITY
// §2): тест берёт его из перехваченной ссылки, как это сделал бы человек,
// открывший письмо.
import type { MailService } from '../../src/mail/mail.service';

interface SentLoginLink {
  to: string;
  link: string;
}

export interface FakeMailService {
  service: MailService;
  sent: SentLoginLink[];
}

export function createFakeMailService(): FakeMailService {
  const sent: SentLoginLink[] = [];
  const service = {
    sendLoginLink: (input: SentLoginLink) => {
      sent.push(input);
      return Promise.resolve();
    },
  } as unknown as MailService;
  return { service, sent };
}

/** Токен из ссылки `.../login/email?token=<64hex>`, перехваченной фейком. */
export function tokenFromLink(link: string): string {
  return new URL(link).searchParams.get('token') ?? '';
}
