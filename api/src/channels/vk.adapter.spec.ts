// fetch подменяется на globalThis — сеть не трогаем (CLAUDE.md «Тесты»).
import { Logger } from '@nestjs/common';
import { VkAdapter } from './vk.adapter';

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: () => Promise.resolve(body) } as Response;
}

describe('VkAdapter', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('config не ВК (например telegram) — failed, не retryable, сеть не трогаем', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch');
    const adapter = new VkAdapter();

    const result = await adapter.send({ text: 'x' }, { chatId: '@school' });

    expect(result.status).toBe('failed');
    if (result.status === 'failed') expect(result.retryable).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('успех — POST на messages.send с access_token/peer_id/message, externalId из response', async () => {
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse({ response: 555 }));
    const adapter = new VkAdapter();

    const result = await adapter.send(
      { text: 'Через 30 минут занятие' },
      { token: 'tok123', peerId: 2000000001 },
    );

    expect(result).toEqual({ status: 'sent', externalId: '555' });
    const [url, init] = fetchSpy.mock.calls[0] ?? [];
    expect(url).toBe('https://api.vk.com/method/messages.send');
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    const body = (init?.body as URLSearchParams).toString();
    expect(body).toContain('access_token=tok123');
    expect(body).toContain('peer_id=2000000001');
    expect(body).toContain('message=');
  });

  it('HTTP-ошибка (res.ok: false) — failed до чтения JSON, retryable на 5xx', async () => {
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(jsonResponse({}, false, 503));
    const adapter = new VkAdapter();

    const result = await adapter.send({ text: 'x' }, { token: 't', peerId: 1 });

    expect(result).toEqual({
      status: 'failed',
      error: 'ВК ответил 503',
      retryable: true,
    });
    expect(fetchSpy).toHaveBeenCalled();
  });

  it('HTTP-ошибка вне 429/5xx — не retryable', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({}, false, 404));
    const adapter = new VkAdapter();

    const result = await adapter.send({ text: 'x' }, { token: 't', peerId: 1 });

    expect(result).toEqual({
      status: 'failed',
      error: 'ВК ответил 404',
      retryable: false,
    });
  });

  it('ошибка ВК error_code 15 (доступ запрещён) — текст про токен, не retryable', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        jsonResponse({ error: { error_code: 15, error_msg: 'Access denied' } }),
      );
    const adapter = new VkAdapter();

    const result = await adapter.send({ text: 'x' }, { token: 't', peerId: 1 });

    expect(result).toEqual({
      status: 'failed',
      error:
        'Токен сообщества не подходит или у бота нет прав. Проверьте токен и доступ к беседе.',
      retryable: false,
    });
  });

  it('ошибка ВК error_code 6 (флуд) — временно недоступен, retryable', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        jsonResponse({ error: { error_code: 6, error_msg: 'Too many requests' } }),
      );
    const adapter = new VkAdapter();

    const result = await adapter.send({ text: 'x' }, { token: 't', peerId: 1 });

    expect(result).toEqual({
      status: 'failed',
      error: 'ВК временно недоступен. Повторите позже.',
      retryable: true,
    });
  });

  it('ошибка ВК прочего кода — текст с кодом, не retryable', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        jsonResponse({ error: { error_code: 100, error_msg: 'Bad params' } }),
      );
    const adapter = new VkAdapter();

    const result = await adapter.send({ text: 'x' }, { token: 't', peerId: 1 });

    expect(result).toEqual({
      status: 'failed',
      error: 'ВК отклонил сообщение (код 100). Проверьте настройки беседы.',
      retryable: false,
    });
  });

  it('сетевая ошибка (fetch бросил Error) — failed, retryable', async () => {
    jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));
    const adapter = new VkAdapter();

    const result = await adapter.send({ text: 'x' }, { token: 't', peerId: 1 });

    expect(result).toEqual({ status: 'failed', error: 'network down', retryable: true });
  });

  it('fetch бросил не-Error — failed, общий текст, retryable', async () => {
    jest.spyOn(globalThis, 'fetch').mockRejectedValue('строка вместо Error');
    const adapter = new VkAdapter();

    const result = await adapter.send({ text: 'x' }, { token: 't', peerId: 1 });

    expect(result).toEqual({
      status: 'failed',
      error: 'Не удалось отправить сообщение',
      retryable: true,
    });
  });

  it('videoUrl игнорируется адаптером — YouTube-ссылка уходит только через text', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({}));
    const adapter = new VkAdapter();

    await adapter.send(
      { text: 'Запись: https://youtu.be/x', videoUrl: 'https://youtu.be/x' },
      { token: 't', peerId: 1 },
    );

    const [, init] = fetchSpy.mock.calls[0] ?? [];
    const body = (init?.body as URLSearchParams).toString();
    expect(body).not.toContain('video.save');
  });

  it('ошибка ВК уходит в logger.warn без токена', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        error: { error_code: 15, error_msg: 'access denied for tok123' },
      }),
    );
    const adapter = new VkAdapter();

    await adapter.send({ text: 'x' }, { token: 'tok123', peerId: 1 });

    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).not.toContain('tok123');
  });
});
