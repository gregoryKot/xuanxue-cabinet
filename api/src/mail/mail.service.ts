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
    await this.postToResend(to, SUBJECT, loginLinkText(link));
  }

  /** Привязка почты к уже вошедшему человеку (ADR-0059) — рядом с
   * sendLoginLink, тот же postToResend и то же поведение при неудаче
   * (бросает, а не молчит: письмо подтверждения не best-effort). */
  async sendEmailConfirmLink({ to, link }: SendLoginLinkInput): Promise<void> {
    await this.postToResend(to, CONFIRM_SUBJECT, confirmLinkText(link));
  }

  /** Общий POST в Resend: у sendLoginLink и sendEmailConfirmLink свои
   * subject/text, а неудача у обоих одна — бросить. Раньше метод отдавал
   * boolean ради третьего, best-effort вызывающего (почтовое плечо
   * уведомлений об экзамене, ADR-0039); плечо снято вместе с ним (ADR-0061),
   * и развилка «бросить или промолчать» осталась без второй ветки. Бросок
   * здесь, а не у вызывающего: так его нельзя забыть. */
  private async postToResend(to: string, subject: string, text: string): Promise<void> {
    const apiKey = this.config.get<string>('RESEND_API_KEY');
    const from = this.config.get<string>('MAIL_FROM');
    if (!apiKey || !from) {
      throw this.failedToSend(subject, 'нет RESEND_API_KEY или MAIL_FROM');
    }

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
      throw this.failedToSend(subject, errorMessage(err));
    }

    // Тело ответа Resend в лог не идёт: может содержать адрес получателя.
    if (!res.ok) throw this.failedToSend(subject, `Resend ответил ${res.status}`);
  }

  /** Причина — нам в лог, человеку — один и тот же текст: ошибку, которую
   * увидел пользователь, должно быть видно и на сервере (CLAUDE.md «Логи»),
   * а доменные ошибки фильтр не логирует. */
  private failedToSend(subject: string, reason: string): NotAvailableError {
    this.logger.error(`Не удалось отправить письмо «${subject}»: ${reason}`);
    return new NotAvailableError(EMAIL_LOGIN_SEND_FAILED_MESSAGE);
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
