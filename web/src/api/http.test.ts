// Тесты единственной точки сетевых запросов (CLAUDE.md, «одна механика — один
// компонент»): формат ошибок и заголовки проверяются здесь один раз, а не в
// каждом компоненте, который ходит в API.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiFetch } from './http';

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

function brokenJsonResponse(status: number): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.reject(new SyntaxError('Unexpected token')),
  } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
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
