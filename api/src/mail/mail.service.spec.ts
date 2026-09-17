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

// sendExamNotification — почтовый резерв уведомлений экзамена (слой 4.7,
// ADR-0039): в отличие от sendLoginLink не бросает, отдаёт boolean —
// MailExamNotifier best-effort и не должен ронять HTTP-ответ сервиса
// экзамена из-за письма.
describe('MailService.sendExamNotification', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('нет RESEND_API_KEY/MAIL_FROM — false, сеть не трогаем', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch');
    const service = new MailService(fakeConfig({}));

    await expect(
      service.sendExamNotification({
        to: 'a@example.com',
        subject: 'Тема',
        text: 'Текст',
      }),
    ).resolves.toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('успех — true, POST с переданным subject/text', async () => {
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse(true));
    const service = new MailService(fakeConfig(CONFIGURED));

    await expect(
      service.sendExamNotification({
        to: 'teacher@example.com',
        subject: 'Сдана работа',
        text: 'Работа ждёт вашей проверки.',
      }),
    ).resolves.toBe(true);

    const [, init] = fetchSpy.mock.calls[0] ?? [];
    const body = JSON.parse(init?.body as string) as { subject: string; text: string };
    expect(body.subject).toBe('Сдана работа');
    expect(body.text).toBe('Работа ждёт вашей проверки.');
  });

  it('Resend ответил не-ok — false, не бросает', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(false, 422));
    const service = new MailService(fakeConfig(CONFIGURED));

    await expect(
      service.sendExamNotification({
        to: 'a@example.com',
        subject: 'Тема',
        text: 'Текст',
      }),
    ).resolves.toBe(false);
  });

  it('сетевая ошибка (fetch бросил) — false, не бросает', async () => {
    jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));
    const service = new MailService(fakeConfig(CONFIGURED));

    await expect(
      service.sendExamNotification({
        to: 'a@example.com',
        subject: 'Тема',
        text: 'Текст',
      }),
    ).resolves.toBe(false);
  });
});
