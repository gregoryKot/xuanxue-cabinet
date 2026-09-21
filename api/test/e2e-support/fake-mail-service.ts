// Фейковый MailService для e2e без сети (auth-email-resend.e2e-spec.ts,
// email-link.e2e-spec.ts, auth-email-code.e2e-spec.ts) — подменяется через
// `overrides` createTestApp() (create-app.ts, тот же приём, что у
// fake-telegram-client.ts). Токен и код в письме — единственный способ теста
// добраться до сырых значений (в базе только их хеши, SECURITY §2): тест
// берёт их из перехваченного письма, как это сделал бы человек, открывший
// его. `sentConfirm` — отдельный список для sendEmailConfirmLink (ADR-0059):
// у него кода нет (mail.service.ts), тест не должен путать письмо входа с
// письмом подтверждения привязки почты.
import type { MailService } from '../../src/mail/mail.service';

interface SentLoginLink {
  to: string;
  link: string;
  code: string;
}

interface SentConfirmLink {
  to: string;
  link: string;
}

export interface FakeMailService {
  service: MailService;
  sent: SentLoginLink[];
  sentConfirm: SentConfirmLink[];
}

export function createFakeMailService(): FakeMailService {
  const sent: SentLoginLink[] = [];
  const sentConfirm: SentConfirmLink[] = [];
  const service = {
    sendLoginLink: (input: SentLoginLink) => {
      sent.push(input);
      return Promise.resolve();
    },
    sendEmailConfirmLink: (input: SentConfirmLink) => {
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

/** Код из письма входа (ADR-0104) — рядом с tokenFromLink() тем же приёмом:
 * тест достаёт код из перехваченного письма, а не считает его сам. */
export function codeFromLetter(letter: SentLoginLink): string {
  return letter.code;
}
