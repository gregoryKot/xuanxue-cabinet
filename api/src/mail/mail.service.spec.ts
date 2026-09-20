// fetch подменяется на globalThis — сеть не трогаем (CLAUDE.md «Тесты»), тот
// же приём, что у vk.adapter.spec.ts/telegram.adapter.spec.ts.
import type { ConfigService } from '@nestjs/config';
import { NotAvailableError } from '../common/errors';
import { MailService } from './mail.service';

function fakeConfig(values: Record<string, string | undefined>): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

function jsonResponse(ok: boolean, status = 200): Response {
  return { ok, status } as Response;
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
      service.sendLoginLink({ to: 'a@example.com', link: 'https://x/login' }),
    ).rejects.toBeInstanceOf(NotAvailableError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('успех — POST на api.resend.com с Bearer/from/to/subject, с таймаутом', async () => {
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse(true));
    const service = new MailService(fakeConfig(CONFIGURED));

    await service.sendLoginLink({
      to: 'ученик@example.com',
      link: 'https://xuanxue.su/login/email?token=abc',
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
  });

  it('Resend ответил не-ok — NotAvailableError с текстом для пользователя', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(false, 422));
    const service = new MailService(fakeConfig(CONFIGURED));

    await expect(
      service.sendLoginLink({ to: 'a@example.com', link: 'https://x/login' }),
    ).rejects.toMatchObject({
      message: 'Не удалось отправить письмо. Попробуйте ещё раз через минуту.',
    });
  });

  it('сетевая ошибка (fetch бросил) — NotAvailableError, тот же текст', async () => {
    jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));
    const service = new MailService(fakeConfig(CONFIGURED));

    await expect(
      service.sendLoginLink({ to: 'a@example.com', link: 'https://x/login' }),
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

  it('Resend ответил не-ok — NotAvailableError (бросает, не отдаёт false)', async () => {
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
