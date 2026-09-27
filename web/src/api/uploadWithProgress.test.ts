// Тесты uploadWithProgress.ts — фейковый XMLHttpRequest вместо настоящей
// сети (jsdom не эмулирует XHR-прогресс), тот же приём, что http.test.ts для
// fetch. Формат ошибок и заголовки должны совпасть с apiFetch — сверяем то,
// что разошлось бы, если бы этот модуль дублировал разбор конверта вместо
// общего apiError.ts.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CSRF_HEADER } from '@xuanxue/shared';
import { setUnauthorizedListener, type ApiError } from './apiError';
import { API_TIMEOUT_MS, NETWORK_ERROR_MESSAGE, TIMEOUT_ERROR_MESSAGE } from './http';
import { uploadWithProgress } from './uploadWithProgress';

/** Минимальный двойник XMLHttpRequest — то, чем реально пользуется
 * uploadWithProgress.ts, плюс тестовые хелперы `respond`/`fail`/`emitProgress`
 * (их у настоящего XHR нет). */
class FakeXhr {
  static instances: FakeXhr[] = [];
  method = '';
  url = '';
  headers: Record<string, string> = {};
  withCredentials = false;
  status = 0;
  responseText = '';
  aborted = false;
  sentBody: unknown;
  private responseHeaders: Record<string, string> = {};
  upload: { onprogress: ((event: ProgressEvent) => void) | null } = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;

  constructor() {
    FakeXhr.instances.push(this);
  }
  open(method: string, url: string): void {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(name: string, value: string): void {
    this.headers[name] = value;
  }
  send(body: unknown): void {
    this.sentBody = body;
  }
  abort(): void {
    this.aborted = true;
    this.onabort?.();
  }
  getResponseHeader(name: string): string | null {
    return this.responseHeaders[name] ?? null;
  }
  emitProgress(loaded: number, total: number): void {
    this.upload.onprogress?.({ lengthComputable: true, loaded, total } as ProgressEvent);
  }
  respond(status: number, body: unknown, headers: Record<string, string> = {}): void {
    this.status = status;
    this.responseText = typeof body === 'string' ? body : JSON.stringify(body);
    this.responseHeaders = headers;
    this.onload?.();
  }
  fail(): void {
    this.onerror?.();
  }
}

function stubXhr(): () => FakeXhr {
  FakeXhr.instances = [];
  vi.stubGlobal('XMLHttpRequest', FakeXhr);
  return () => {
    const last = FakeXhr.instances.at(-1);
    if (!last) throw new Error('XMLHttpRequest ни разу не создан');
    return last;
  };
}

/** Ждёт, что промис отклонится, и возвращает причину как ApiError — тот же
 * хелпер, что http.test.ts. */
async function expectApiError(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (e) {
    return e as ApiError;
  }
  throw new Error('ожидалось, что uploadWithProgress бросит ApiError');
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  setUnauthorizedListener(null);
});

describe('uploadWithProgress — запрос и успех', () => {
  it('POST на /api<path>, credentials, CSRF-заголовок и content-type тела', async () => {
    const latest = stubXhr();
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'video/mp4' });

    const promise = uploadWithProgress<{ id: string }>('/exam-videos', { body: blob });
    const xhr = latest();
    expect(xhr.method).toBe('POST');
    expect(xhr.url).toBe('/api/exam-videos');
    expect(xhr.withCredentials).toBe(true);
    expect(xhr.headers[CSRF_HEADER]).toBe('fetch');
    expect(xhr.headers['content-type']).toBe('video/mp4');
    expect(xhr.sentBody).toBe(blob);

    xhr.respond(201, { id: 'vid1' });
    await expect(promise).resolves.toEqual({ id: 'vid1' });
  });

  it('на 204 возвращает undefined', async () => {
    const latest = stubXhr();
    const promise = uploadWithProgress('/exam-videos', { body: new Blob([]) });
    latest().respond(204, null);

    await expect(promise).resolves.toBeUndefined();
  });

  it('прогресс — onProgress получает долю 0..1 на каждое событие отправки', () => {
    const latest = stubXhr();
    const onProgress = vi.fn();

    void uploadWithProgress('/exam-videos', { body: new Blob([]), onProgress });
    latest().emitProgress(25, 100);

    expect(onProgress).toHaveBeenCalledWith(0.25);
  });
});

describe('uploadWithProgress — ошибки бэкенда (общий разбор с apiFetch)', () => {
  it('не-2xx с конвертом — ApiError по данным конверта', async () => {
    const latest = stubXhr();
    const promise = uploadWithProgress('/exam-videos', { body: new Blob([]) });

    latest().respond(413, {
      statusCode: 413,
      code: 'video_too_large',
      message: 'Видео больше 50 МБ.',
    });

    const error = await expectApiError(promise);
    expect(error.status).toBe(413);
    expect(error.code).toBe('video_too_large');
    expect(error.message).toBe('Видео больше 50 МБ.');
  });

  it('401 будит unauthorizedListener — тот же слушатель, что у apiFetch', async () => {
    const latest = stubXhr();
    const listener = vi.fn();
    setUnauthorizedListener(listener);
    const promise = uploadWithProgress('/exam-videos', { body: new Blob([]) });

    latest().respond(401, { statusCode: 401, code: 'unauthorized', message: 'Войдите' });

    await expectApiError(promise);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('не-JSON тело ошибки — ApiError с кодом unknown', async () => {
    const latest = stubXhr();
    const promise = uploadWithProgress('/exam-videos', { body: new Blob([]) });

    latest().respond(502, '<html>502</html>');

    const error = await expectApiError(promise);
    expect(error.status).toBe(502);
    expect(error.code).toBe('unknown');
  });
});

describe('uploadWithProgress — сеть, таймаут бездействия, отмена', () => {
  it('xhr.onerror — ApiError со статусом 0 и кодом network', async () => {
    const latest = stubXhr();
    const promise = uploadWithProgress('/exam-videos', { body: new Blob([]) });

    latest().fail();

    const error = await expectApiError(promise);
    expect(error.status).toBe(0);
    expect(error.code).toBe('network');
    expect(error.message).toBe(NETWORK_ERROR_MESSAGE);
  });

  it('без единого события прогресса дольше inactivityTimeoutMs — обрывает TIMEOUT_ERROR_MESSAGE', async () => {
    vi.useFakeTimers();
    stubXhr();

    const errorPromise = expectApiError(
      uploadWithProgress('/exam-videos', { body: new Blob([]) }),
    );
    await vi.advanceTimersByTimeAsync(API_TIMEOUT_MS);
    const error = await errorPromise;

    expect(error.message).toBe(TIMEOUT_ERROR_MESSAGE);
  });

  it('прогресс сбрасывает таймер — общее время дольше таймаута не обрывает загрузку', async () => {
    vi.useFakeTimers();
    const latest = stubXhr();

    const promise = uploadWithProgress<{ ok: boolean }>('/exam-videos', {
      body: new Blob([]),
    });
    const xhr = latest();

    await vi.advanceTimersByTimeAsync(API_TIMEOUT_MS - 1_000);
    xhr.emitProgress(1, 10);
    await vi.advanceTimersByTimeAsync(API_TIMEOUT_MS - 1_000);
    xhr.respond(200, { ok: true });

    await expect(promise).resolves.toEqual({ ok: true });
  });

  it('отмену вызывающим (signal) от таймаута отличает — NETWORK_ERROR_MESSAGE, не TIMEOUT', async () => {
    const latest = stubXhr();
    const controller = new AbortController();

    const errorPromise = expectApiError(
      uploadWithProgress('/exam-videos', {
        body: new Blob([]),
        signal: controller.signal,
      }),
    );
    controller.abort();
    void latest();
    const error = await errorPromise;

    expect(error.message).toBe(NETWORK_ERROR_MESSAGE);
  });
});
