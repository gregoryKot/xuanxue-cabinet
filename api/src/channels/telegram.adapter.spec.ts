// Фейковый клиент telegraf — сеть не трогаем (CLAUDE.md «Тесты»: реальные
// вызовы замоканы). fakeConfig — тот же приём, что telegram-auth.service.spec.ts.
import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { TelegramApiClient } from './telegram-client';
import { TelegramAdapter } from './telegram.adapter';

const BOT_TOKEN = '123456:fake-token-not-real';

// Типизированная сигнатура callApi — без неё jest.fn() возвращает `any`, а
// .mock.calls[i][2].signal становится небезопасным доступом (eslint
// no-unsafe-*). Payload — общий для sendMessage/sendVideo набор полей теста.
type CallApiPayload = {
  chat_id: string;
  text?: string;
  video?: string;
  caption?: string;
};
type CallApiReturn = Promise<{ message_id: number }>;
type CallApiArgs = [string, CallApiPayload, { signal: AbortSignal }];
type CallApiMock = jest.Mock<CallApiReturn, CallApiArgs>;
// expect.any(...) типизирован как `any` в @types/jest — приводим к AbortSignal,
// иначе eslint no-unsafe-assignment на каждом toHaveBeenCalledWith ниже.
const ANY_SIGNAL = expect.any(AbortSignal) as unknown as AbortSignal;

function fakeConfig(token: string | undefined): ConfigService {
  return { get: () => token } as unknown as ConfigService;
}

function fakeClient(
  callApi: CallApiMock = jest
    .fn<CallApiReturn, CallApiArgs>()
    .mockResolvedValue({ message_id: 1 }),
): TelegramApiClient {
  return { callApi } as unknown as TelegramApiClient;
}

// Без дефолта у token: аргумент `undefined`, переданный явно, и опущенный
// аргумент — для параметра по умолчанию одно и то же (сработал бы дефолт),
// а тест «BOT_TOKEN не настроен» как раз и передаёт undefined явно.
function adapterWith(client: TelegramApiClient, token: string | undefined) {
  return new TelegramAdapter(fakeConfig(token), () => client);
}

describe('TelegramAdapter', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('BOT_TOKEN не настроен — failed, не retryable, сеть не трогаем', async () => {
    const callApi: CallApiMock = jest.fn<CallApiReturn, CallApiArgs>();
    const adapter = adapterWith(fakeClient(callApi), undefined);

    const result = await adapter.send({ text: 'привет' }, { chatId: '@school' });

    expect(result).toEqual({
      status: 'failed',
      error: 'Бот Telegram не подключён. Напишите администратору школы.',
      retryable: false,
    });
    expect(callApi).not.toHaveBeenCalled();
  });

  it('config не telegram (например ВК) — failed, не retryable', async () => {
    const adapter = adapterWith(fakeClient(), BOT_TOKEN);

    const result = await adapter.send({ text: 'привет' }, { token: 't', peerId: 1 });

    expect(result.status).toBe('failed');
    if (result.status === 'failed') expect(result.retryable).toBe(false);
  });

  it('текст без видео — callApi(sendMessage), externalId из message_id', async () => {
    const callApi: CallApiMock = jest
      .fn<CallApiReturn, CallApiArgs>()
      .mockResolvedValue({ message_id: 42 });
    const adapter = adapterWith(fakeClient(callApi), BOT_TOKEN);

    const result = await adapter.send(
      { text: 'Через 30 минут занятие' },
      { chatId: '@school' },
    );

    expect(result).toEqual({ status: 'sent', externalId: '42' });
    expect(callApi).toHaveBeenCalledWith(
      'sendMessage',
      { chat_id: '@school', text: 'Через 30 минут занятие' },
      { signal: ANY_SIGNAL },
    );
  });

  it('видео с короткой подписью — одно callApi(sendVideo) с caption', async () => {
    const callApi: CallApiMock = jest
      .fn<CallApiReturn, CallApiArgs>()
      .mockResolvedValue({ message_id: 7 });
    const adapter = adapterWith(fakeClient(callApi), BOT_TOKEN);

    const result = await adapter.send(
      { text: 'Запись готова', telegramFileId: 'file123' },
      { chatId: '@school' },
    );

    expect(result).toEqual({ status: 'sent', externalId: '7' });
    expect(callApi).toHaveBeenCalledTimes(1);
    expect(callApi).toHaveBeenCalledWith(
      'sendVideo',
      { chat_id: '@school', video: 'file123', caption: 'Запись готова' },
      { signal: ANY_SIGNAL },
    );
  });

  it('видео с подписью длиннее 1024 — sendVideo без caption, затем sendMessage тем же signal', async () => {
    const callApi: CallApiMock = jest
      .fn<CallApiReturn, CallApiArgs>()
      .mockResolvedValue({ message_id: 9 });
    const adapter = adapterWith(fakeClient(callApi), BOT_TOKEN);
    const longText = 'а'.repeat(1025);

    const result = await adapter.send(
      { text: longText, telegramFileId: 'file123' },
      { chatId: '@school' },
    );

    expect(result).toEqual({ status: 'sent', externalId: '9' });
    expect(callApi).toHaveBeenNthCalledWith(
      1,
      'sendVideo',
      { chat_id: '@school', video: 'file123' },
      { signal: ANY_SIGNAL },
    );
    expect(callApi).toHaveBeenNthCalledWith(
      2,
      'sendMessage',
      { chat_id: '@school', text: longText },
      { signal: ANY_SIGNAL },
    );
    // Один бюджет времени на всю отправку — оба вызова получили один и тот
    // же AbortSignal, не по свежему на каждый.
    const firstSignal = callApi.mock.calls[0]?.[2]?.signal;
    const secondSignal = callApi.mock.calls[1]?.[2]?.signal;
    expect(firstSignal).toBe(secondSignal);
  });

  it('ошибка Telegram 429 без retry_after — временно недоступен, retryable', async () => {
    const callApi: CallApiMock = jest
      .fn<CallApiReturn, CallApiArgs>()
      .mockRejectedValue(Object.assign(new Error('Too Many Requests'), { code: 429 }));
    const adapter = adapterWith(fakeClient(callApi), BOT_TOKEN);

    const result = await adapter.send({ text: 'x' }, { chatId: '@school' });

    expect(result).toEqual({
      status: 'failed',
      error: 'Telegram временно недоступен. Повторите позже.',
      retryable: true,
    });
  });

  // M2: retry_after не читался вовсе — повтор через 2 минуты мог попасть в
  // ещё действующий лимит Telegram.
  it('ошибка Telegram 429 с parameters.retry_after — retryAfterSec в результате', async () => {
    const callApi: CallApiMock = jest.fn<CallApiReturn, CallApiArgs>().mockRejectedValue(
      Object.assign(new Error('Too Many Requests: retry after 30'), {
        code: 429,
        description: 'Too Many Requests: retry after 30',
        parameters: { retry_after: 30 },
      }),
    );
    const adapter = adapterWith(fakeClient(callApi), BOT_TOKEN);

    const result = await adapter.send({ text: 'x' }, { chatId: '@school' });

    expect(result).toEqual({
      status: 'failed',
      error: 'Telegram временно недоступен. Повторите позже.',
      retryable: true,
      retryAfterSec: 30,
    });
  });

  it('ошибка Telegram 403 (бот не админ) — не retryable, текст с действием', async () => {
    const callApi: CallApiMock = jest.fn<CallApiReturn, CallApiArgs>().mockRejectedValue(
      Object.assign(new Error('Forbidden: bot is not a member'), {
        code: 403,
        description: 'Forbidden: bot is not a member',
      }),
    );
    const adapter = adapterWith(fakeClient(callApi), BOT_TOKEN);

    const result = await adapter.send({ text: 'x' }, { chatId: '@school' });

    expect(result).toEqual({
      status: 'failed',
      error: 'Бот не админ канала. Добавьте бота администратором и повторите тест.',
      retryable: false,
    });
  });

  it('ошибка Telegram 403 (бота удалили из чата) — тот же текст «не админ»', async () => {
    const callApi: CallApiMock = jest.fn<CallApiReturn, CallApiArgs>().mockRejectedValue(
      Object.assign(new Error('Forbidden: bot was kicked from the group chat'), {
        code: 403,
        description: 'Forbidden: bot was kicked from the group chat',
      }),
    );
    const adapter = adapterWith(fakeClient(callApi), BOT_TOKEN);

    const result = await adapter.send({ text: 'x' }, { chatId: '@school' });

    expect(result).toEqual({
      status: 'failed',
      error: 'Бот не админ канала. Добавьте бота администратором и повторите тест.',
      retryable: false,
    });
  });

  it('ошибка Telegram 400 (чат не найден) — не retryable, текст с действием', async () => {
    const callApi: CallApiMock = jest.fn<CallApiReturn, CallApiArgs>().mockRejectedValue(
      Object.assign(new Error('Bad Request: chat not found'), {
        code: 400,
        description: 'Bad Request: chat not found',
      }),
    );
    const adapter = adapterWith(fakeClient(callApi), BOT_TOKEN);

    const result = await adapter.send({ text: 'x' }, { chatId: '@school' });

    expect(result).toEqual({
      status: 'failed',
      error: 'Чат не найден. Проверьте адрес канала.',
      retryable: false,
    });
  });

  // M2: раньше messageForCode(400) всегда возвращал «чат не найден» — учитель
  // шёл проверять бота в чате, хотя дело было в тексте поста.
  it('ошибка Telegram 400 (пост длиннее лимита) — текст про лимит поста, не «чат не найден»', async () => {
    const callApi: CallApiMock = jest.fn<CallApiReturn, CallApiArgs>().mockRejectedValue(
      Object.assign(new Error('Bad Request: message is too long'), {
        code: 400,
        description: 'Bad Request: message is too long',
      }),
    );
    const adapter = adapterWith(fakeClient(callApi), BOT_TOKEN);

    const result = await adapter.send({ text: 'x' }, { chatId: '@school' });

    expect(result).toEqual({
      status: 'failed',
      error: 'Пост длиннее лимита Telegram (4096 знаков). Сократите шаблон или тему.',
      retryable: false,
    });
  });

  it('ошибка Telegram 400 (неверный file_id) — текст про запись', async () => {
    const callApi: CallApiMock = jest.fn<CallApiReturn, CallApiArgs>().mockRejectedValue(
      Object.assign(new Error('Bad Request: wrong file identifier/HTTP URL specified'), {
        code: 400,
        description: 'Bad Request: wrong file identifier/HTTP URL specified',
      }),
    );
    const adapter = adapterWith(fakeClient(callApi), BOT_TOKEN);

    const result = await adapter.send(
      { text: 'x', telegramFileId: 'stale-file-id' },
      { chatId: '@school' },
    );

    expect(result).toEqual({
      status: 'failed',
      error: 'Telegram не нашёл видео по file_id — пришлите запись боту заново.',
      retryable: false,
    });
  });

  it('ошибка Telegram 400 (подпись длиннее лимита) — текст про подпись', async () => {
    const callApi: CallApiMock = jest.fn<CallApiReturn, CallApiArgs>().mockRejectedValue(
      Object.assign(new Error('Bad Request: message caption is too long'), {
        code: 400,
        description: 'Bad Request: message caption is too long',
      }),
    );
    const adapter = adapterWith(fakeClient(callApi), BOT_TOKEN);

    const result = await adapter.send(
      { text: 'x', telegramFileId: 'file123' },
      { chatId: '@school' },
    );

    expect(result).toEqual({
      status: 'failed',
      error: 'Подпись к видео длиннее 1024 знаков. Сократите текст занятия.',
      retryable: false,
    });
  });

  it('ошибка Telegram 400 с неизвестным description — текст Telegram как есть', async () => {
    const callApi: CallApiMock = jest.fn<CallApiReturn, CallApiArgs>().mockRejectedValue(
      Object.assign(new Error('Bad Request: something unexpected'), {
        code: 400,
        description: 'Bad Request: something unexpected',
      }),
    );
    const adapter = adapterWith(fakeClient(callApi), BOT_TOKEN);

    const result = await adapter.send({ text: 'x' }, { chatId: '@school' });

    expect(result).toEqual({
      status: 'failed',
      error: 'Telegram отклонил сообщение: Bad Request: something unexpected',
      retryable: false,
    });
  });

  // SECURITY §5: description Telegram теоретически может содержать
  // BOT_TOKEN (в URL) — тот же scrub, что и для лога, обязан отработать и
  // здесь, а не только в logger.warn.
  it('description с BOT_TOKEN — токен вычищен из текста ошибки 400', async () => {
    const description = `Bad Request: webhook for bot${BOT_TOKEN} failed, something unexpected`;
    const callApi: CallApiMock = jest
      .fn<CallApiReturn, CallApiArgs>()
      .mockRejectedValue(
        Object.assign(new Error(description), { code: 400, description }),
      );
    const adapter = adapterWith(fakeClient(callApi), BOT_TOKEN);

    const result = await adapter.send({ text: 'x' }, { chatId: '@school' });

    expect(result.status).toBe('failed');
    if (result.status === 'failed') {
      expect(result.error).not.toContain(BOT_TOKEN);
      expect(result.error).toContain('[секрет]');
    }
  });

  it('неизвестный код ошибки Telegram — не retryable, текст с кодом', async () => {
    const callApi: CallApiMock = jest
      .fn<CallApiReturn, CallApiArgs>()
      .mockRejectedValue(Object.assign(new Error('Unauthorized'), { code: 401 }));
    const adapter = adapterWith(fakeClient(callApi), BOT_TOKEN);

    const result = await adapter.send({ text: 'x' }, { chatId: '@school' });

    expect(result).toEqual({
      status: 'failed',
      error: 'Telegram отклонил сообщение (код 401). Проверьте настройки бота.',
      retryable: false,
    });
  });

  it('произвольная ошибка без code — retryable (перестраховка)', async () => {
    const callApi: CallApiMock = jest
      .fn<CallApiReturn, CallApiArgs>()
      .mockRejectedValue(new Error('boom'));
    const adapter = adapterWith(fakeClient(callApi), BOT_TOKEN);

    const result = await adapter.send({ text: 'x' }, { chatId: '@school' });

    expect(result).toEqual({ status: 'failed', error: 'boom', retryable: true });
  });

  it('таймаут — фейк отклоняет промис по signal.abort, результат retryable', async () => {
    const controller = new AbortController();
    jest.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal);
    const callApi: CallApiMock = jest.fn<CallApiReturn, CallApiArgs>(
      () =>
        new Promise((_resolve, reject) => {
          controller.signal.addEventListener('abort', () =>
            reject(Object.assign(new Error('Timeout'), { name: 'AbortError' })),
          );
        }),
    );
    const adapter = adapterWith(fakeClient(callApi), BOT_TOKEN);

    const resultPromise = adapter.send({ text: 'x' }, { chatId: '@school' });
    controller.abort();
    const result = await resultPromise;

    expect(result.status).toBe('failed');
    if (result.status === 'failed') expect(result.retryable).toBe(true);
  });

  it('ошибка провайдера уходит в logger.warn без токена', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const callApi: CallApiMock = jest
      .fn<CallApiReturn, CallApiArgs>()
      .mockRejectedValue(new Error(`Forbidden: bot${BOT_TOKEN} not admin`));
    const adapter = adapterWith(fakeClient(callApi), BOT_TOKEN);

    await adapter.send({ text: 'x' }, { chatId: '@school' });

    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).not.toContain(BOT_TOKEN);
  });
});
