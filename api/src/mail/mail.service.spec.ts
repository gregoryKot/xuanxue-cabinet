// fetch подменяется на globalThis — сеть не трогаем (CLAUDE.md «Тесты»), тот
// же приём, что у vk.adapter.spec.ts/telegram.adapter.spec.ts.
import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import {
  EMAIL_LOGIN_QUOTA_MESSAGE,
  EMAIL_LOGIN_SEND_FAILED_MESSAGE,
  EMAIL_LOGIN_TOKEN_TTL_MIN,
} from '@xuanxue/shared';
import { NotAvailableError } from '../common/errors';
import { MailService } from './mail.service';

function fakeConfig(values: Record<string, string | undefined>): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

function jsonResponse(ok: boolean, status = 200, body?: unknown): Response {
  return {
    ok,
    status,
    json: () =>
      body === undefined ? Promise.reject(new Error('no body')) : Promise.resolve(body),
  } as unknown as Response;
}

const CONFIGURED = {
  RESEND_API_KEY: 're_test_key',
  MAIL_FROM: 'Школа <school@xuanxue.su>',
};

describe('MailService.sendLoginLink', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('нет RESEND_API_KEY/MAIL_FROM — NotAvailableError, сеть не трогаем', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch');
    const service = new MailService(fakeConfig({}));

    await expect(
      service.sendLoginLink({
        to: 'a@example.com',
        link: 'https://x/login',
        code: '123456',
      }),
    ).rejects.toBeInstanceOf(NotAvailableError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // Причина отказа была видна только в ветке fetch: без ключа человек получал
  // 503, а в логах не было ничего (CLAUDE.md «Логи»).
  it('нет ключа — причина в logger.error: 503 у человека видно и на сервере', async () => {
    const error = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const service = new MailService(fakeConfig({}));

    await expect(
      service.sendLoginLink({
        to: 'a@example.com',
        link: 'https://x/login',
        code: '123456',
      }),
    ).rejects.toBeInstanceOf(NotAvailableError);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('RESEND_API_KEY'));
  });

  it('успех — POST на api.resend.com с Bearer/from/to/subject, с таймаутом', async () => {
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse(true));
    const service = new MailService(fakeConfig(CONFIGURED));

    await service.sendLoginLink({
      to: 'ученик@example.com',
      link: 'https://xuanxue.su/login/email?token=abc',
      code: '482913',
    });

    const [url, init] = fetchSpy.mock.calls[0] ?? [];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init?.method).toBe('POST');
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(init?.headers).toMatchObject({ authorization: 'Bearer re_test_key' });
    const body = JSON.parse(init?.body as string) as {
      from: string;
      to: string;
      subject: string;
      text: string;
    };
    expect(body.from).toBe(CONFIGURED.MAIL_FROM);
    expect(body.to).toBe('ученик@example.com');
    expect(body.text).toContain('https://xuanxue.su/login/email?token=abc');
    // Код письма (ADR-0104) — второй способ потратить ту же заявку. Стоит
    // первым и с указанием, что делать: он подходит везде, а ссылка ниже —
    // только там, где кабинет открыт в браузере (отзыв владельца
    // 2026-09-22 про непонятные объяснения).
    expect(body.text).toContain('482913');
    expect(body.text).toContain('Код для входа: 482913');
    expect(body.text).toContain('Введите его на странице входа');
    // Срок в письме берётся из той же константы, что и срок заявки: правка
    // TTL не оставит в письме прежнее число (аудит 2026-10-01, F30).
    expect(body.text).toContain(`Код работает ${EMAIL_LOGIN_TOKEN_TTL_MIN} минут`);
    expect(body.text.indexOf('482913')).toBeLessThan(body.text.indexOf('token=abc'));
  });

  it('Resend ответил не-ok — NotAvailableError с текстом для пользователя', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(false, 422));
    const service = new MailService(fakeConfig(CONFIGURED));

    await expect(
      service.sendLoginLink({
        to: 'a@example.com',
        link: 'https://x/login',
        code: '123456',
      }),
    ).rejects.toMatchObject({
      message: 'Не удалось отправить письмо. Попробуйте ещё раз через минуту.',
    });
  });

  // Аудит 2026-10-01, F48: квота Resend (100 писем в сутки) исчерпана —
  // «через минуту» не поможет, а про вход через Telegram не говорили.
  it('квота Resend исчерпана (429 daily_quota_exceeded) — совет войти через Telegram, warn mail.quota', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse(false, 429, { name: 'daily_quota_exceeded' }));
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const service = new MailService(fakeConfig(CONFIGURED));

    await expect(
      service.sendLoginLink({
        to: 'a@example.com',
        link: 'https://x/login',
        code: '123456',
      }),
    ).rejects.toMatchObject({
      name: NotAvailableError.name,
      message: EMAIL_LOGIN_QUOTA_MESSAGE,
    });
    expect(EMAIL_LOGIN_QUOTA_MESSAGE).toContain('Telegram');
    expect(EMAIL_LOGIN_QUOTA_MESSAGE).not.toContain('через минуту');
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ tag: 'mail.quota', status: 429 }),
      expect.any(String),
    );
  });

  it('429 rate_limit_exceeded — не квота, прежний текст «через минуту»', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse(false, 429, { name: 'rate_limit_exceeded' }));
    const service = new MailService(fakeConfig(CONFIGURED));

    await expect(
      service.sendLoginLink({
        to: 'a@example.com',
        link: 'https://x/login',
        code: '123456',
      }),
    ).rejects.toMatchObject({ message: EMAIL_LOGIN_SEND_FAILED_MESSAGE });
  });

  it('сетевая ошибка (fetch бросил) — NotAvailableError, тот же текст', async () => {
    jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));
    const service = new MailService(fakeConfig(CONFIGURED));

    await expect(
      service.sendLoginLink({
        to: 'a@example.com',
        link: 'https://x/login',
        code: '123456',
      }),
    ).rejects.toBeInstanceOf(NotAvailableError);
  });
});

// Привязка почты к уже вошедшему человеку (ADR-0059) — как sendLoginLink, не
// best-effort: неудача бросает, а не молчит.
describe('MailService.sendEmailConfirmLink', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('нет RESEND_API_KEY/MAIL_FROM — NotAvailableError, сеть не трогаем', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch');
    const service = new MailService(fakeConfig({}));

    await expect(
      service.sendEmailConfirmLink({
        to: 'a@example.com',
        link: 'https://x/email/confirm',
      }),
    ).rejects.toBeInstanceOf(NotAvailableError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('успех — POST с адресом, ссылкой в тексте и упоминанием часа действия', async () => {
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse(true));
    const service = new MailService(fakeConfig(CONFIGURED));

    await service.sendEmailConfirmLink({
      to: 'ученик@example.com',
      link: 'https://xuanxue.su/email/confirm?token=abc',
    });

    const [, init] = fetchSpy.mock.calls[0] ?? [];
    const body = JSON.parse(init?.body as string) as { to: string; text: string };
    expect(body.to).toBe('ученик@example.com');
    expect(body.text).toContain('https://xuanxue.su/email/confirm?token=abc');
    expect(body.text).toContain('час');
    expect(body.text).toContain('не входит в кабинет');
  });

  it('Resend ответил не-ok — NotAvailableError (бросает, а не молчит)', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(false, 422));
    const service = new MailService(fakeConfig(CONFIGURED));

    await expect(
      service.sendEmailConfirmLink({
        to: 'a@example.com',
        link: 'https://x/email/confirm',
      }),
    ).rejects.toBeInstanceOf(NotAvailableError);
  });

  it('сетевая ошибка (fetch бросил) — NotAvailableError', async () => {
    jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));
    const service = new MailService(fakeConfig(CONFIGURED));

    await expect(
      service.sendEmailConfirmLink({
        to: 'a@example.com',
        link: 'https://x/email/confirm',
      }),
    ).rejects.toBeInstanceOf(NotAvailableError);
  });
});
