// Скачивание байт целиком (fetchBlob.ts): глобальный fetch подменён, сети нет.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setUnauthorizedListener } from './apiError';
import { fetchBlob } from './fetchBlob';
import { ApiError, NETWORK_ERROR_MESSAGE, TIMEOUT_ERROR_MESSAGE } from './http';

const PATH = '/api/exam-videos/a/bytes';
const TIMEOUT_MS = 5000;

function blobResponse(body: Blob): Response {
  return { ok: true, status: 200, blob: () => Promise.resolve(body) } as Response;
}

function errorResponse(status: number, body: unknown): Response {
  return { ok: false, status, json: () => Promise.resolve(body) } as Response;
}

/** Висит, пока не отменят: как настоящий fetch, реагирует только на signal. */
function neverSettlingFetch() {
  return vi.fn(
    (_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () =>
          reject(new DOMException('aborted', 'AbortError')),
        );
      }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  setUnauthorizedListener(null);
});

describe('fetchBlob', () => {
  it('отдаёт тело ответа и ходит с куками и сигналом', async () => {
    const bytes = new Blob([new Uint8Array(3)]);
    const fetchMock = vi.fn(() => Promise.resolve(blobResponse(bytes)));
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();

    const result = await fetchBlob(PATH, {
      signal: controller.signal,
      timeoutMs: TIMEOUT_MS,
    });

    expect(result).toBe(bytes);
    expect(fetchMock).toHaveBeenCalledWith(
      PATH,
      expect.objectContaining({
        credentials: 'include',
        signal: expect.any(AbortSignal) as AbortSignal,
      }),
    );
  });

  it('403: ApiError со статусом и текстом сервера — по статусу видно «нет доступа»', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          errorResponse(403, {
            statusCode: 403,
            code: 'forbidden',
            message: 'Нет прав.',
          }),
        ),
      ),
    );

    await expect(
      fetchBlob(PATH, { signal: new AbortController().signal, timeoutMs: TIMEOUT_MS }),
    ).rejects.toMatchObject({ name: 'ApiError', status: 403, message: 'Нет прав.' });
  });

  it('401 будит слушателя разлогина, как у apiFetch', async () => {
    const listener = vi.fn();
    setUnauthorizedListener(listener);
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(errorResponse(401, { statusCode: 401 }))),
    );

    await expect(
      fetchBlob(PATH, { signal: new AbortController().signal, timeoutMs: TIMEOUT_MS }),
    ).rejects.toMatchObject({ status: 401 });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('ответ об ошибке не JSON — запасной текст и статус ответа', async () => {
    const response = {
      ok: false,
      status: 502,
      json: () => Promise.reject(new SyntaxError('Unexpected token')),
    } as Response;
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(response)),
    );

    await expect(
      fetchBlob(PATH, { signal: new AbortController().signal, timeoutMs: TIMEOUT_MS }),
    ).rejects.toMatchObject({ status: 502, code: 'unknown' });
  });

  it('сети нет — ApiError со статусом 0', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))),
    );

    const result = fetchBlob(PATH, {
      signal: new AbortController().signal,
      timeoutMs: TIMEOUT_MS,
    });

    await expect(result).rejects.toBeInstanceOf(ApiError);
    await expect(result).rejects.toMatchObject({
      status: 0,
      message: NETWORK_ERROR_MESSAGE,
    });
  });

  it('сервер молчит дольше таймаута — ApiError о долгом ответе', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', neverSettlingFetch());

    const result = fetchBlob(PATH, {
      signal: new AbortController().signal,
      timeoutMs: TIMEOUT_MS,
    });
    const assertion = expect(result).rejects.toMatchObject({
      status: 0,
      message: TIMEOUT_ERROR_MESSAGE,
    });
    await vi.advanceTimersByTimeAsync(TIMEOUT_MS);

    await assertion;
  });

  it('отмена вызывающим — не таймаут: обычный сетевой отказ', async () => {
    vi.stubGlobal('fetch', neverSettlingFetch());
    const controller = new AbortController();

    const result = fetchBlob(PATH, { signal: controller.signal, timeoutMs: TIMEOUT_MS });
    controller.abort();

    await expect(result).rejects.toMatchObject({
      status: 0,
      message: NETWORK_ERROR_MESSAGE,
    });
  });
});
