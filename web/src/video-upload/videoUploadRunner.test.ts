// Прогон загрузки напрямую, без React (useVideoUpload.test.ts покрывает его
// через хук) — здесь controllable isCancelled/waitForResume, чтобы дотянуться
// до веток, которые через хук воспроизвести неудобно: отмена ровно в момент
// сбоя запроса и отмена, случившаяся во время паузы. Сеть — фейковый
// транспорт (test-support/fakeVideoTransport.ts); настоящие маршруты ответа
// ученика — attempt/answerVideoTransport.test.ts.
import { describe, expect, it, vi } from 'vitest';
import { ApiError, UPLOAD_TIMEOUT_MS } from '../api/http';
import type { FormError } from '../components/FormServerError';
import {
  FAKE_UPLOAD_RESULT,
  fakeSession,
  makeFakeTransport,
} from '../test-support/fakeVideoTransport';
import { computeVideoFingerprint } from './videoFingerprint';
import { runVideoUpload } from './videoUploadRunner';

function makeFile(bytes = 20): File {
  return new File([new Uint8Array(bytes)], 'form.mp4', { type: 'video/mp4' });
}

function baseParams(
  overrides: Partial<Parameters<typeof runVideoUpload<{ id: string }>>[0]> = {},
) {
  return {
    file: makeFile(),
    transport: makeFakeTransport(),
    signal: new AbortController().signal,
    isCancelled: () => false,
    onProgress: vi.fn(),
    waitForResume: () => Promise.resolve(),
    onFailed: vi.fn(),
    onDone: vi.fn(),
    ...overrides,
  };
}

describe('runVideoUpload — отмена посреди цикла частей', () => {
  it('isCancelled() стал true между частями — выходит, не шлёт следующую', async () => {
    let cancelled = false;
    let progressCalls = 0;
    const transport = makeFakeTransport();
    const onDone = vi.fn();

    await runVideoUpload(
      baseParams({
        transport,
        isCancelled: () => cancelled,
        // Первый вызов — после старта (до цикла частей), второй — после
        // части 1: отмену ставим только тогда, чтобы дойти до начала
        // следующего витка `while` (строка `if (isCancelled()) return;`).
        onProgress: () => {
          progressCalls += 1;
          if (progressCalls === 2) cancelled = true;
        },
        onDone,
      }),
    );

    expect(onDone).not.toHaveBeenCalled();
    expect(transport.start).toHaveBeenCalledTimes(1);
    expect(transport.uploadPart).toHaveBeenCalledTimes(1); // часть 1, не больше
    expect(transport.complete).not.toHaveBeenCalled();
  });
});

describe('runVideoUpload — отмена ровно в момент сбоя запроса', () => {
  it('катч видит isCancelled() true — выходит без onFailed и без паузы', async () => {
    let cancelled = false;
    const transport = makeFakeTransport({
      start: () => {
        cancelled = true;
        return Promise.reject(new ApiError('Нет связи с сервером.', 0, 'network'));
      },
    });
    const onFailed = vi.fn();
    const waitForResume = vi.fn().mockResolvedValue(undefined);

    await runVideoUpload(
      baseParams({ transport, isCancelled: () => cancelled, onFailed, waitForResume }),
    );

    expect(onFailed).not.toHaveBeenCalled();
    expect(waitForResume).not.toHaveBeenCalled();
  });
});

describe('runVideoUpload — отмена во время паузы ожидания', () => {
  it('после waitForResume видит isCancelled() true — не повторяет шаг', async () => {
    let attempts = 0;
    let cancelledAfterWait = false;
    const transport = makeFakeTransport({
      start: () => {
        attempts += 1;
        if (attempts === 1) {
          return Promise.reject(new ApiError('Нет связи с сервером.', 0, 'network'));
        }
        return Promise.reject(new Error('не должно было повториться после отмены'));
      },
    });
    const onFailed = vi.fn();
    const onDone = vi.fn();

    await runVideoUpload(
      baseParams({
        transport,
        isCancelled: () => cancelledAfterWait,
        waitForResume: () => {
          cancelledAfterWait = true; // отмена «случилась» ровно во время паузы
          return Promise.resolve();
        },
        onFailed,
        onDone,
      }),
    );

    expect(attempts).toBe(1); // ни одного повтора после отмены
    expect(onFailed).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
  });
});

describe('runVideoUpload — happy path напрямую', () => {
  it('старт → части → complete → onDone', async () => {
    const transport = makeFakeTransport();
    const onDone = vi.fn();

    await runVideoUpload(baseParams({ transport, onDone }));

    expect(onDone).toHaveBeenCalledWith(FAKE_UPLOAD_RESULT);
    expect(transport.uploadPart.mock.calls.map(([, partNumber]) => partNumber)).toEqual([
      1, 2, 3,
    ]);
  });

  it('части идут с отменой и своим, длиннее общего, таймаутом (F15)', async () => {
    const transport = makeFakeTransport();
    const controller = new AbortController();

    await runVideoUpload(baseParams({ transport, signal: controller.signal }));

    const request = transport.uploadPart.mock.calls[0]?.[3];
    expect(request?.signal).toBe(controller.signal);
    expect(request?.timeoutMs).toBeGreaterThan(UPLOAD_TIMEOUT_MS);
    // Старт и завершение — на общем таймауте, без своего.
    expect(transport.start.mock.calls[0]?.[1]).toEqual({ signal: controller.signal });
    expect(transport.complete.mock.calls[0]?.[2]).toEqual({ signal: controller.signal });
  });

  it('продолжение: части, уже принятые сервером, не шлёт заново', async () => {
    const transport = makeFakeTransport({
      start: () => Promise.resolve(fakeSession([1, 2])),
    });

    await runVideoUpload(baseParams({ transport }));

    expect(transport.uploadPart).toHaveBeenCalledTimes(1);
    expect(transport.uploadPart.mock.calls[0]?.[1]).toBe(3);
  });
});

describe('runVideoUpload — отпечаток по содержимому (F18)', () => {
  it('в старт уходит отпечаток по содержимому, а не «размер:дата»', async () => {
    const transport = makeFakeTransport();
    const file = new File([new Uint8Array(20).fill(3)], 'form.mp4', {
      lastModified: 12345,
    });

    await runVideoUpload(baseParams({ transport, file }));

    const fingerprint = await computeVideoFingerprint(file);
    expect(fingerprint).toMatch(/^20:[0-9a-f]{64}$/);
    expect(transport.start.mock.calls[0]?.[0]).toEqual({ sizeBytes: 20, fingerprint });
  });

  it('те же байты с новой датой изменения (iPhone, «Фото») шлют тот же отпечаток', async () => {
    const transport = makeFakeTransport();
    const bytes = new Uint8Array(20).fill(7);
    const exported = (lastModified: number) =>
      new File([bytes], 'IMG.MOV', { type: 'video/quicktime', lastModified });

    await runVideoUpload(baseParams({ transport, file: exported(1) }));
    await runVideoUpload(baseParams({ transport, file: exported(2) }));

    const [first, second] = transport.start.mock.calls.map(([input]) => input);
    expect(second).toEqual(first);
  });
});

describe('runVideoUpload — файл не читается при подсчёте отпечатка', () => {
  it('onFailed с понятным текстом, в сеть не ходит', async () => {
    const file = makeFile();
    vi.spyOn(file, 'arrayBuffer').mockRejectedValue(new Error('NotReadableError'));
    const transport = makeFakeTransport();
    const onFailed = vi.fn<(error: FormError) => void>();

    await runVideoUpload(baseParams({ file, transport, onFailed }));

    expect(onFailed).toHaveBeenCalledTimes(1);
    expect(onFailed.mock.calls[0]?.[0].message).toContain('Не удалось прочитать файл');
    expect(transport.start).not.toHaveBeenCalled();
  });

  it('отмена, пока считается отпечаток, — старт не уходит', async () => {
    const file = makeFile();
    let finishReading!: (buffer: ArrayBuffer) => void;
    vi.spyOn(file, 'arrayBuffer').mockReturnValue(
      new Promise((resolve) => {
        finishReading = resolve;
      }),
    );
    const transport = makeFakeTransport();
    let cancelled = false;
    const run = runVideoUpload(
      baseParams({ file, transport, isCancelled: () => cancelled }),
    );

    cancelled = true;
    finishReading(new ArrayBuffer(file.size));
    await run;

    expect(transport.start).not.toHaveBeenCalled();
  });

  it('отмена и сбой чтения вместе — тихо: после «Отмены» ошибки не показываем', async () => {
    const file = makeFile();
    vi.spyOn(file, 'arrayBuffer').mockRejectedValue(new Error('NotReadableError'));
    const onFailed = vi.fn();

    await runVideoUpload(baseParams({ file, onFailed, isCancelled: () => true }));

    expect(onFailed).not.toHaveBeenCalled();
  });
});

// Кадр-превью (ADR-0165): снимается параллельно частям, ждётся только перед
// `complete`, а его отсутствие или сбой видео не мешают.
describe('runVideoUpload — кадр-превью', () => {
  it('кадр уходит в complete, а снимок начат сразу, до старта на сервере', async () => {
    const transport = makeFakeTransport();
    const capturePoster = vi.fn(() => Promise.resolve<string | null>('QkFTRTY0'));

    await runVideoUpload(baseParams({ transport, capturePoster }));

    expect(transport.complete.mock.calls[0]?.[1]).toBe('QkFTRTY0');
    expect(capturePoster).toHaveBeenCalledTimes(1);
    expect(capturePoster.mock.invocationCallOrder[0]).toBeLessThan(
      transport.start.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it('части не ждут кадр, а complete ждёт', async () => {
    let finishCapture!: (poster: string | null) => void;
    const transport = makeFakeTransport();
    const capturePoster = () =>
      new Promise<string | null>((resolve) => {
        finishCapture = resolve;
      });
    const run = runVideoUpload(baseParams({ transport, capturePoster }));

    await vi.waitFor(() => expect(transport.uploadPart).toHaveBeenCalledTimes(3));
    expect(transport.complete).not.toHaveBeenCalled();
    finishCapture('QkFTRTY0');
    await run;

    expect(transport.complete.mock.calls[0]?.[1]).toBe('QkFTRTY0');
  });

  it.each([
    ['снять не вышло (null)', () => Promise.resolve(null)],
    ['снимок упал', () => Promise.reject(new Error('нет кодека'))],
  ])('%s — видео завершается без кадра', async (_name, capturePoster) => {
    const transport = makeFakeTransport();
    const onDone = vi.fn();

    await runVideoUpload(baseParams({ transport, capturePoster, onDone }));

    expect(transport.complete.mock.calls[0]?.[1]).toBeUndefined();
    expect(onDone).toHaveBeenCalledWith(FAKE_UPLOAD_RESULT);
  });

  it('без снятия кадра вовсе — complete без кадра, как раньше', async () => {
    const transport = makeFakeTransport();

    await runVideoUpload(baseParams({ transport }));

    expect(transport.complete.mock.calls[0]?.[1]).toBeUndefined();
  });

  it('отмена, пока ждали кадр, — complete не зовётся', async () => {
    let cancelled = false;
    let finishCapture!: (poster: string | null) => void;
    const transport = makeFakeTransport();
    const capturePoster = () =>
      new Promise<string | null>((resolve) => {
        finishCapture = resolve;
      });
    const run = runVideoUpload(
      baseParams({ transport, capturePoster, isCancelled: () => cancelled }),
    );
    await vi.waitFor(() => expect(transport.uploadPart).toHaveBeenCalledTimes(3));

    cancelled = true;
    finishCapture('QkFTRTY0');
    await run;

    expect(transport.complete).not.toHaveBeenCalled();
  });
});
