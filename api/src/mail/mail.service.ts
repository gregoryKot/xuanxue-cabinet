// Отправка писем через Resend HTTP API напрямую, без SDK (ADR-0029) —
// единственный потребитель сейчас — вход по одноразовой ссылке (ADR-0005).
// Доступность (RESEND_API_KEY/MAIL_FROM/PUBLIC_URL) проверяет вызывающий
// код (EmailAuthService) до вызова этого сервиса; проверка здесь — вторая
// линия обороны, не первая (SECURITY §8: fetch без ключа не уходит).
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EMAIL_LOGIN_SEND_FAILED_MESSAGE } from '@xuanxue/shared';
import { NotAvailableError } from '../common/errors';

const RESEND_API_URL = 'https://api.resend.com/emails';
const RESEND_TIMEOUT_MS = 10_000;
const SUBJECT = 'Вход в кабинет «Сюань-Сюэ»';

interface SendLoginLinkInput {
  to: string;
  link: string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly config: ConfigService) {}

  async sendLoginLink({ to, link }: SendLoginLinkInput): Promise<void> {
    const apiKey = this.config.get<string>('RESEND_API_KEY');
    const from = this.config.get<string>('MAIL_FROM');
    if (!apiKey || !from) throw new NotAvailableError(EMAIL_LOGIN_SEND_FAILED_MESSAGE);

    let res: Response;
    try {
      res = await fetch(RESEND_API_URL, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ from, to, subject: SUBJECT, text: loginLinkText(link) }),
        signal: AbortSignal.timeout(RESEND_TIMEOUT_MS),
      });
    } catch (err) {
      this.logger.error(
        `Не удалось отправить письмо входа: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw new NotAvailableError(EMAIL_LOGIN_SEND_FAILED_MESSAGE);
    }

    if (!res.ok) {
      // Тело ответа Resend в лог не идёт: может содержать адрес получателя.
      this.logger.error(`Resend ответил ${res.status} на отправку письма входа`);
      throw new NotAvailableError(EMAIL_LOGIN_SEND_FAILED_MESSAGE);
    }
  }
}

function loginLinkText(link: string): string {
  return [
    'Здравствуйте!',
    '',
    `Ссылка для входа в кабинет (действует 15 минут): ${link}`,
    '',
    'Не запрашивали вход? Просто не открывайте её — письмо ни на что не влияет.',
  ].join('\n');
}
