// Тест отправки отчёта о сбое (ADR-0071). Защиты (потолок, дубли, «не
// зацикливаться») живут в модульном состоянии — вместо экспорта функции
// сброса только для тестов (knip уронил бы CI на экспорт без рантайм-
// импортёра) на каждый тест берём свежий модуль через vi.resetModules() +
// динамический import().
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { CLIENT_ERROR_LIMITS } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import type { reportClientError as reportClientErrorType } from './reportClientError';

vi.mock('../api/http', async (importOriginal) => ({
  ...(await importOriginal<typeof HttpModule>()),
  apiFetch: vi.fn(),
}));

let reportClientError: typeof reportClientErrorType;
let apiFetchMock: ReturnType<typeof vi.fn>;
let ApiError: typeof HttpModule.ApiError;

/** Тело последнего запроса — apiFetch(path, { method, body }). */
function lastRequestBody(): { kind: string; message: string; path: string } {
  const call = apiFetchMock.mock.calls.at(-1) as [string, { body: unknown }];
  return call[1].body as { kind: string; message: string; path: string };
}

beforeAll(() => {
  // Единый адрес для всех тестов файла — «path берётся из адреса страницы»
  // проверяется отдельным тестом ниже, тут же просто фиксируем окружение.
  const originalLocation = window.location;
  Object.defineProperty(window, 'location', {
    value: { ...originalLocation, pathname: '/planning' },
    configurable: true,
    writable: true,
  });
});

beforeEach(async () => {
  vi.resetModules();
  const http = await import('../api/http');
  // vi.mock создаёт apiFetch один раз на файл — resetModules освежает
  // reportClientError.ts (счётчики, Set дублей), но не сам мок: без явного
  // mockReset его история звонков и заданный mockResolvedValue/mockRejectedValue
  // утекали бы из теста в тест (так и падало на первом прогоне).
  apiFetchMock = vi.mocked(http.apiFetch);
  apiFetchMock.mockReset();
  ApiError = http.ApiError;
  ({ reportClientError } = await import('./reportClientError'));
});

describe('reportClientError', () => {
  it('шлёт POST /client-errors с телом ровно из трёх полей, путь — из адреса страницы', async () => {
    apiFetchMock.mockResolvedValue(undefined);

    await reportClientError('render', new Error('упал экран'));

    expect(apiFetchMock).toHaveBeenCalledTimes(1);
    const [path, init] = apiFetchMock.mock.calls[0] as [string, { method: string }];
    expect(path).toBe('/client-errors');
    expect(init.method).toBe('POST');
    expect(lastRequestBody()).toEqual({
      kind: 'render',
      message: 'упал экран',
      path: '/planning',
    });
  });

  it('для не-Error значения шлёт его строковое представление', async () => {
    apiFetchMock.mockResolvedValue(undefined);

    await reportClientError('unhandled', 'просто строка');

    expect(lastRequestBody().message).toBe('просто строка');
  });

  it('длинное сообщение обрезается по CLIENT_ERROR_LIMITS.message', async () => {
    apiFetchMock.mockResolvedValue(undefined);
    const longMessage = 'ж'.repeat(CLIENT_ERROR_LIMITS.message + 50);

    await reportClientError('render', new Error(longMessage));

    expect(lastRequestBody().message.length).toBe(CLIENT_ERROR_LIMITS.message);
  });

  it('ApiError не пересказывается — сервер уже знает о своей ошибке (ADR-0053)', async () => {
    apiFetchMock.mockResolvedValue(undefined);

    await reportClientError(
      'unhandled',
      new ApiError('Сервер не ответил', 500, 'internal_error'),
    );

    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it('сетевой сбой (status: 0 — офлайн) тоже не пересказывается', async () => {
    apiFetchMock.mockResolvedValue(undefined);

    await reportClientError(
      'unhandled',
      new ApiError('Нет связи с сервером.', 0, 'network'),
    );

    expect(apiFetchMock).not.toHaveBeenCalled();
  });

  it('пока летит предыдущий отчёт, новый не начинаем', async () => {
    let resolveFirst: () => void = () => {};
    apiFetchMock.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveFirst = resolve;
        }),
    );

    const first = reportClientError('render', new Error('первый'));
    // Синхронно, пока первый отчёт ещё не долетел до ответа сервера —
    // reportInFlight должен блокировать второй запрос, а не поставить его в очередь.
    const second = reportClientError('unhandled', new Error('второй'));
    resolveFirst();
    await Promise.all([first, second]);

    expect(apiFetchMock).toHaveBeenCalledTimes(1);
  });

  it('дубль (тот же вид, адрес и текст) за загрузку страницы уходит один раз', async () => {
    apiFetchMock.mockResolvedValue(undefined);

    await reportClientError('render', new Error('одно и то же'));
    await reportClientError('render', new Error('одно и то же'));

    expect(apiFetchMock).toHaveBeenCalledTimes(1);
  });

  it('разные сообщения дублями не считаются', async () => {
    apiFetchMock.mockResolvedValue(undefined);

    await reportClientError('render', new Error('первое'));
    await reportClientError('render', new Error('второе'));

    expect(apiFetchMock).toHaveBeenCalledTimes(2);
  });

  it('потолок — не больше 3 отчётов за загрузку страницы', async () => {
    apiFetchMock.mockResolvedValue(undefined);

    await reportClientError('render', new Error('первая'));
    await reportClientError('render', new Error('вторая'));
    await reportClientError('render', new Error('третья'));
    await reportClientError('render', new Error('четвёртая'));

    expect(apiFetchMock).toHaveBeenCalledTimes(3);
  });

  // lazyRoute.ts ждёт отчёт перед перезагрузкой страницы: без таймаута
  // медленный ответ сервера оставил бы человека на скелетоне до таймаута
  // браузера.
  it('запрос уходит с таймаутом — отчёт не висит бесконечно', async () => {
    apiFetchMock.mockResolvedValue(undefined);

    await reportClientError('render', new Error('упал экран'));

    const [, init] = apiFetchMock.mock.calls[0] as [string, { signal?: AbortSignal }];
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(init.signal?.aborted).toBe(false);
  });

  it('отказ apiFetch не бросает наружу и не порождает второй отчёт того же сбоя', async () => {
    apiFetchMock.mockRejectedValue(new Error('офлайн'));

    await expect(
      reportClientError('render', new Error('упал экран')),
    ).resolves.toBeUndefined();
    // Тот же сбой ещё раз — сеть по-прежнему недоступна, но повторной
    // попытки быть не должно (см. комментарий-«почему» в reportClientError.ts).
    await reportClientError('render', new Error('упал экран'));

    expect(apiFetchMock).toHaveBeenCalledTimes(1);
  });
});
