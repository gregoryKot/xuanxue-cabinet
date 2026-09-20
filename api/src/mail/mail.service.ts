// Отправка писем через Resend HTTP API напрямую, без SDK (ADR-0029) —
// потребители: вход по одноразовой ссылке (ADR-0005) и подтверждение адреса
// почты у уже вошедшего человека (ADR-0059). Доступность
// (RESEND_API_KEY/MAIL_FROM/PUBLIC_URL) проверяет вызывающий код
// (EmailAuthService) до вызова sendLoginLink; проверка здесь — вторая линия
// обороны, не первая (SECURITY §8: fetch без ключа не уходит).
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EMAIL_LOGIN_SEND_FAILED_MESSAGE } from '@xuanxue/shared';
import { errorMessage } from '../common/error-info';
import { NotAvailableError } from '../common/errors';

const RESEND_API_URL = 'https://api.resend.com/emails';
const RESEND_TIMEOUT_MS = 10_000;
const SUBJECT = 'Вход в кабинет «Сюань-Сюэ»';
const CONFIRM_SUBJECT = 'Подтвердите почту в кабинете «Сюань-Сюэ»';

// Тоже форма sendEmailConfirmLink (ADR-0059) — одна и та же пара {to, link},
// два разных письма, второй интерфейс не заводим (CLAUDE.md «Дубли»).
interface SendLoginLinkInput {
  to: string;
  link: string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly config: ConfigService) {}

  async sendLoginLink({ to, link }: SendLoginLinkInput): Promise<void> {
    const delivered = await this.postToResend(to, SUBJECT, loginLinkText(link));
    if (!delivered) throw new NotAvailableError(EMAIL_LOGIN_SEND_FAILED_MESSAGE);
  }

  /** Привязка почты к уже вошедшему человеку (ADR-0059) — рядом с
   * sendLoginLink, тот же postToResend и то же поведение при неудаче
   * (бросает, а не молчит: письмо подтверждения не best-effort). */
  async sendEmailConfirmLink({ to, link }: SendLoginLinkInput): Promise<void> {
    const delivered = await this.postToResend(to, CONFIRM_SUBJECT, confirmLinkText(link));
    if (!delivered) throw new NotAvailableError(EMAIL_LOGIN_SEND_FAILED_MESSAGE);
  }

  /** Общий POST в Resend — используют sendLoginLink и sendEmailConfirmLink,
   * у каждого свои subject/text, поведение на неудаче (бросить) одно и то
   * же: второй раз собирать этот же запрос в каждом методе незачем. */
  private async postToResend(
    to: string,
    subject: string,
    text: string,
  ): Promise<boolean> {
    const apiKey = this.config.get<string>('RESEND_API_KEY');
    const from = this.config.get<string>('MAIL_FROM');
    if (!apiKey || !from) return false;

    let res: Response;
    try {
      res = await fetch(RESEND_API_URL, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ from, to, subject, text }),
        signal: AbortSignal.timeout(RESEND_TIMEOUT_MS),
      });
    } catch (err) {
      this.logger.error(`Не удалось отправить письмо «${subject}»: ${errorMessage(err)}`);
      return false;
    }

    if (!res.ok) {
      // Тело ответа Resend в лог не идёт: может содержать адрес получателя.
      this.logger.error(`Resend ответил ${res.status} на отправку письма «${subject}»`);
      return false;
    }
    return true;
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

function confirmLinkText(link: string): string {
  return [
    'Здравствуйте!',
    '',
    'Вы указали эту почту вторым способом входа в кабинет школы «Сюань-Сюэ».',
    `Ссылка подтверждает адрес, а не входит в кабинет, и действует час: ${link}`,
    '',
    'Не вы указывали этот адрес? Не открывайте ссылку — без неё ничего не изменится.',
  ].join('\n');
}
