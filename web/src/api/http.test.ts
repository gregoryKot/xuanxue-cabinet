// Тесты единственной точки сетевых запросов (CLAUDE.md, «одна механика — один
// компонент»): формат ошибок и заголовки проверяются здесь один раз, а не в
// каждом компоненте, который ходит в API.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { APP_VERSION_HEADER, CSRF_HEADER } from '@xuanxue/shared';
import { hasNewAppVersion } from './appVersion';
import {
  API_TIMEOUT_MS,
  ApiError,
  NETWORK_ERROR_MESSAGE,
  TIMEOUT_ERROR_MESSAGE,
  apiFetch,
  setUnauthorizedListener,
} from './http';
import { putPrefetched } from './prefetchCache';

/** Мок fetch, который никогда сам не резолвится и не реджектится — ведёт
 * себя как настоящий fetch, только реагирует на переданный signal (реальный
 * fetch реджектится AbortError, когда signal отменяют). Нужен тестам
 * таймаута ниже: без него `await fetch` в http.ts повис бы, а никакого
 * abort от нашего кода не было бы, чтобы этот повисший промис снять. */
function neverSettlingFetch(): ReturnType<typeof vi.fn> {
  return vi.fn().mockImplementation(
    (_url: string, options: RequestInit) =>
      new Promise((_resolve, reject) => {
        options.signal?.addEventListener('abort', () => {
          reject(new DOMException('The operation was aborted.', 'AbortError'));
        });
      }),
  );
}

// По умолчанию заголовка версии нет (`null`) — как у настоящего ответа без
// него; тесты версии (ADR-0101) передают свой набор заголовков явно.
function fakeHeaders(headers: Record<string, string> = {}): Pick<Headers, 'get'> {
  return { get: (name: string) => headers[name] ?? null };
}

function jsonResponse(
  status: number,
  body: unknown,
  headers?: Record<string, string>,
): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: fakeHeaders(headers),
    json: () => Promise.resolve(body),
  } as Response;
}

function brokenJsonResponse(status: number): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: fakeHeaders(),
    json: () => Promise.reject(new SyntaxError('Unexpected token')),
  } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
  // Тесты таймаута ниже включают фейковые таймеры сами — возвращаем
  // настоящие безусловно, иначе упавший тест оставил бы их всем остальным.
  vi.useRealTimers();
});

/** Ждёт, что промис отклонится, и возвращает причину как ApiError. */
async function expectApiError(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (e) {
    return e as ApiError;
  }
  throw new Error('ожидалось, что apiFetch бросит ApiError');
}

describe('apiFetch — успешные ответы', () => {
  it('возвращает распарсенный JSON и ходит с credentials include и accept-заголовком', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await apiFetch<{ ok: boolean }>('/schedule');

    expect(result).toEqual({ ok: true });
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/schedule');
    expect(options.credentials).toBe('include');
    expect((options.headers as Record<string, string>).accept).toBe('application/json');
  });

  it('на 204 возвращает undefined', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(204, null)));

    await expect(apiFetch('/lessons/1')).resolves.toBeUndefined();
  });

  it('сериализует body в JSON и ставит content-type для POST', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { id: '1' }));
    vi.stubGlobal('fetch', fetchMock);

    await apiFetch('/lessons', { method: 'POST', body: { title: 'Занятие' } });

    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(options.method).toBe('POST');
    expect(options.body).toBe(JSON.stringify({ title: 'Занятие' }));
    expect((options.headers as Record<string, string>)['content-type']).toBe(
      'application/json',
    );
  });

  it('Blob-тело (картинка варианта, ADR-0035) уходит как есть, с её типом и CSRF-заголовком', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(201, { id: 'img1' }));
    vi.stubGlobal('fetch', fetchMock);
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' });

    await apiFetch('/exam-images', { method: 'POST', body: blob });

    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(options.body).toBe(blob);
    expect((options.headers as Record<string, string>)['content-type']).toBe('image/png');
    expect((options.headers as Record<string, string>)[CSRF_HEADER]).toBe('fetch');
  });

  it('ставит CSRF-заголовок на мутирующих методах, но не на GET', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    await apiFetch('/lessons', { method: 'PATCH', body: { title: 'x' } });
    await apiFetch('/lessons');

    const [, patchOptions] = fetchMock.mock.calls[0] as [string, RequestInit];
    const [, getOptions] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect((patchOptions.headers as Record<string, string>)[CSRF_HEADER]).toBe('fetch');
    expect((getOptions.headers as Record<string, string>)[CSRF_HEADER]).toBeUndefined();
  });

  it('keepalive уходит в fetch только там, где его попросили', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(204, null));
    vi.stubGlobal('fetch', fetchMock);

    await apiFetch('/client-errors', {
      method: 'POST',
      body: { kind: 'render' },
      keepalive: true,
    });
    await apiFetch('/schedule');

    const [, reportOptions] = fetchMock.mock.calls[0] as [string, RequestInit];
    const [, scheduleOptions] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(reportOptions.keepalive).toBe(true);
    expect(scheduleOptions.keepalive).toBeUndefined();
  });
});

describe('apiFetch — кэш предзагрузки первого экрана (prefetchCache.ts)', () => {
  it('положенный в кэш промис возвращается без похода в fetch', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    putPrefetched('/lessons?limit=1', Promise.resolve({ ok: 'из кэша' }));

    const result = await apiFetch('/lessons?limit=1');

    expect(result).toEqual({ ok: 'из кэша' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('запись отдаётся один раз — второй GET того же пути идёт в сеть', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { ok: 'из сети' }));
    vi.stubGlobal('fetch', fetchMock);
    putPrefetched('/classes?limit=1', Promise.resolve({ ok: 'из кэша' }));

    await apiFetch('/classes?limit=1');
    const second = await apiFetch('/classes?limit=1');

    expect(second).toEqual({ ok: 'из сети' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('POST по тому же пути в кэш не заглядывает', async () => {
    // Путь — не '/lessons': его в этом файле дёргают другие тесты, а запись
    // POST не забирает (не GET) и не удаляет её из кэша (см. http.ts) — она
    // осталась бы висеть и подменила бы собой ответ следующего GET-теста на
    // тот же путь.
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { ok: 'из сети' }));
    vi.stubGlobal('fetch', fetchMock);
    putPrefetched('/prefetch-post-test', Promise.resolve({ ok: 'из кэша' }));

    const result = await apiFetch('/prefetch-post-test', { method: 'POST', body: {} });

    expect(result).toEqual({ ok: 'из сети' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('apiFetch — ошибки бэкенда', () => {
  it('на 404 с конвертом бросает ApiError с данными конверта', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(404, {
          statusCode: 404,
          code: 'lesson_not_found',
          message: 'Занятие не найдено',
          details: ['id: 1'],
          requestId: 'req-1',
        }),
      ),
    );

    const error = await expectApiError(apiFetch('/lessons/1'));

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(404);
    expect(error.code).toBe('lesson_not_found');
    expect(error.message).toBe('Занятие не найдено');
    expect(error.details).toEqual(['id: 1']);
    expect(error.requestId).toBe('req-1');
  });

  it('на не-JSON тело ошибки бросает ApiError с кодом unknown', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(brokenJsonResponse(502)));

    const error = await expectApiError(apiFetch('/lessons'));

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(502);
    expect(error.code).toBe('unknown');
    expect(error.message).toBe('Сервер не ответил. Попробуйте ещё раз.');
  });
});

describe('apiFetch — сетевой сбой', () => {
  it('когда fetch отклоняется, бросает ApiError со статусом 0 и кодом network', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    const error = await expectApiError(apiFetch('/lessons'));

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(0);
    expect(error.code).toBe('network');
    expect(error.message).toBe(
      'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.',
    );
  });
});

describe('apiFetch — таймаут (аудит 2026-09-21)', () => {
  it('когда fetch не отвечает, через API_TIMEOUT_MS бросает ApiError с TIMEOUT_ERROR_MESSAGE', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', neverSettlingFetch());

    const errorPromise = expectApiError(apiFetch('/lessons'));
    await vi.advanceTimersByTimeAsync(API_TIMEOUT_MS);
    const error = await errorPromise;

    expect(error.status).toBe(0);
    expect(error.code).toBe('network');
    expect(error.message).toBe(TIMEOUT_ERROR_MESSAGE);
  });

  it('timeoutMs переопределяет дефолт таймаута', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', neverSettlingFetch());
    const customTimeoutMs = 5_000; // меньше API_TIMEOUT_MS — сработай он не переопределён, тест бы завис

    const errorPromise = expectApiError(
      apiFetch('/lessons', { timeoutMs: customTimeoutMs }),
    );
    await vi.advanceTimersByTimeAsync(customTimeoutMs);
    const error = await errorPromise;

    expect(error.message).toBe(TIMEOUT_ERROR_MESSAGE);
  });

  it('отмену вызывающим (свой signal) от таймаута не отличает — поведение как раньше', async () => {
    vi.stubGlobal('fetch', neverSettlingFetch());
    const controller = new AbortController();

    const errorPromise = expectApiError(
      apiFetch('/lessons', { signal: controller.signal }),
    );
    controller.abort();
    const error = await errorPromise;

    expect(error.status).toBe(0);
    expect(error.code).toBe('network');
    expect(error.message).toBe(NETWORK_ERROR_MESSAGE);
  });
});

describe('apiFetch — 401 оповещает подписчика (AuthProvider)', () => {
  afterEach(() => {
    setUnauthorizedListener(null);
  });

  it('401 вызывает зарегистрированный listener перед тем, как бросить ApiError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(401, {
          statusCode: 401,
          code: 'unauthorized',
          message: 'Войдите',
        }),
      ),
    );
    const listener = vi.fn();
    setUnauthorizedListener(listener);

    await expectApiError(apiFetch('/classes'));

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('403 listener не трогает', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse(403, { statusCode: 403, code: 'forbidden', message: 'Нельзя' }),
        ),
    );
    const listener = vi.fn();
    setUnauthorizedListener(listener);

    await expectApiError(apiFetch('/classes'));

    expect(listener).not.toHaveBeenCalled();
  });
});

describe('apiFetch — версия сборки в заголовке ответа (ADR-0101)', () => {
  // Один тест, не два: appVersion.ts — модульное состояние без сброса между
  // it() в этом файле (см. header-комментарий appVersion.test.ts), поэтому
  // последовательность собрана так, чтобы каждое ожидание было значимым, а не
  // унаследованным флагом с прошлого it().
  it('версия читается до проверки статуса и поднимает флаг только при смене', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          jsonResponse(200, { ok: true }, { [APP_VERSION_HEADER]: 'sha-a' }),
        )
        .mockResolvedValueOnce(
          jsonResponse(
            500,
            { statusCode: 500, code: 'unknown', message: 'Сбой' },
            { [APP_VERSION_HEADER]: 'sha-a' },
          ),
        )
        .mockResolvedValueOnce(
          jsonResponse(
            500,
            { statusCode: 500, code: 'unknown', message: 'Сбой' },
            { [APP_VERSION_HEADER]: 'sha-b' },
          ),
        ),
    );

    await apiFetch('/schedule');
    expect(hasNewAppVersion()).toBe(false); // первый ответ версию только запомнил

    await expectApiError(apiFetch('/schedule')); // тот же sha, но ответ с ошибкой
    expect(hasNewAppVersion()).toBe(false); // версия не сменилась — флаг молчит

    await expectApiError(apiFetch('/schedule')); // ошибка с другим sha
    expect(hasNewAppVersion()).toBe(true); // версия из ответа об ошибке подняла флаг
  });
});
