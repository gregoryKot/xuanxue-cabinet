// Состояние загрузки напрямую через хук, на фейковом транспорте
// (test-support/fakeVideoTransport.ts): сеть не нужна, ответы сервера —
// значения, число вызовов — `vi.fn`. Настоящие маршруты ответа ученика —
// attempt/answerVideoTransport.test.ts. Сеть не подменяется через
// `mockResolvedValueOnce` вовсе (check-once-mock-ratchet.mjs).
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ANSWER_VIDEO_LIMITS,
  ANSWER_VIDEO_PART_INVALID_MESSAGE,
  ANSWER_VIDEO_TOO_LARGE_MESSAGE,
  type VideoCodec,
} from '@xuanxue/shared';
import { ApiError } from '../api/http';
import {
  installFakeWakeLock,
  removeFakeWakeLockAfterEach,
} from '../test-support/fakeWakeLock';
import {
  FAKE_UPLOAD_RESULT,
  fakeSession,
  fakeSessionUpTo,
  makeFakeTransport,
  type FakeUploadResult,
} from '../test-support/fakeVideoTransport';
import type { CompressedVideo, compressVideo } from './compressVideo';
import { useVideoUpload, type UseVideoUploadOptions } from './useVideoUpload';
import type { VideoUploadSession } from './videoUploadTypes';

removeFakeWakeLockAfterEach();

function makeFile(bytes = 20): File {
  return new File([new Uint8Array(bytes)], 'form.mp4', { type: 'video/mp4' });
}

/** Никогда не резолвится — тесты продвигают паузу сами через `resumeNow()`,
 * реальные таймеры не участвуют (CLAUDE.md «Детерминизм»). */
function neverSleep(): Promise<void> {
  return new Promise(() => {});
}

function renderUpload(
  transport = makeFakeTransport(),
  options: Partial<UseVideoUploadOptions<FakeUploadResult>> = {},
) {
  const onDone = vi.fn();
  const createTransport = () => transport;
  const rendered = renderHook(() =>
    useVideoUpload({
      createTransport,
      onDone,
      maxBytes: ANSWER_VIDEO_LIMITS.maxBytes,
      tooLargeMessage: ANSWER_VIDEO_TOO_LARGE_MESSAGE,
      sleep: neverSleep,
      ...options,
    }),
  );
  return { ...rendered, onDone };
}

/** Часть 1 в первый раз не доходит (нет связи), во второй — принимается. */
function transportWithFlakyPart1() {
  let part1Attempts = 0;
  const transport = makeFakeTransport({
    uploadPart: (_uploadId, partNumber): Promise<VideoUploadSession> => {
      if (partNumber === 1) {
        part1Attempts += 1;
        if (part1Attempts === 1) {
          return Promise.reject(new ApiError('Нет связи с сервером.', 0, 'network'));
        }
      }
      return Promise.resolve(fakeSessionUpTo(partNumber));
    },
  });
  return { transport, part1Attempts: () => part1Attempts };
}

describe('useVideoUpload — happy path', () => {
  it('старт → все части → complete → onDone, phase done', async () => {
    const transport = makeFakeTransport();
    const { result, onDone } = renderUpload(transport);

    act(() => result.current.selectFile(makeFile()));

    await waitFor(() => expect(result.current.state.phase).toBe('done'));
    expect(onDone).toHaveBeenCalledWith(FAKE_UPLOAD_RESULT);
    // старт + 3 части + complete
    expect(transport.start).toHaveBeenCalledTimes(1);
    expect(transport.uploadPart).toHaveBeenCalledTimes(3);
    expect(transport.complete).toHaveBeenCalledTimes(1);
  });
});

describe('useVideoUpload — продолжение (receivedParts с сервера)', () => {
  it('не шлёт уже принятую часть 1, продолжает со 2-й', async () => {
    const transport = makeFakeTransport({
      start: () => Promise.resolve(fakeSession([1])),
    });
    const { result } = renderUpload(transport);

    act(() => result.current.selectFile(makeFile()));

    await waitFor(() => expect(result.current.state.phase).toBe('done'));
    expect(transport.uploadPart.mock.calls.map(([, partNumber]) => partNumber)).toEqual([
      2, 3,
    ]);
  });
});

describe('useVideoUpload — сетевой сбой', () => {
  it('уходит в waiting и продолжает после «Продолжить сейчас»', async () => {
    const { transport, part1Attempts } = transportWithFlakyPart1();
    const { result } = renderUpload(transport);

    act(() => result.current.selectFile(makeFile()));
    await waitFor(() => expect(result.current.state.phase).toBe('waiting'));

    act(() => result.current.resumeNow());

    await waitFor(() => expect(result.current.state.phase).toBe('done'));
    expect(part1Attempts()).toBe(2);
  });

  it('сеть вернулась (online) — продолжает сам, не дожидаясь таймера', async () => {
    const { transport, part1Attempts } = transportWithFlakyPart1();
    const { result } = renderUpload(transport);

    act(() => result.current.selectFile(makeFile()));
    await waitFor(() => expect(result.current.state.phase).toBe('waiting'));

    act(() => {
      window.dispatchEvent(new Event('online'));
    });

    await waitFor(() => expect(result.current.state.phase).toBe('done'));
    expect(part1Attempts()).toBe(2);
  });
});

describe('useVideoUpload — пауза по умолчанию (realSleep, без инъекции)', () => {
  it('без своего sleep продолжает после настоящего таймера', async () => {
    vi.useFakeTimers();
    const { transport } = transportWithFlakyPart1();
    const { result } = renderUpload(transport, { sleep: undefined });

    act(() => result.current.selectFile(makeFile()));
    await vi.waitFor(() => expect(result.current.state.phase).toBe('waiting'));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    await vi.waitFor(() => expect(result.current.state.phase).toBe('done'));
    vi.useRealTimers();
  });
});

describe('useVideoUpload — отказ сервера (4xx)', () => {
  it('phase failed с текстом сервера, повтора нет', async () => {
    const transport = makeFakeTransport({
      uploadPart: () =>
        Promise.reject(
          new ApiError(ANSWER_VIDEO_PART_INVALID_MESSAGE, 400, 'invalid_input'),
        ),
    });
    const { result, onDone } = renderUpload(transport);

    act(() => result.current.selectFile(makeFile()));

    await waitFor(() => expect(result.current.state.phase).toBe('failed'));
    expect(result.current.state.error?.message).toBe(ANSWER_VIDEO_PART_INVALID_MESSAGE);
    expect(transport.uploadPart).toHaveBeenCalledTimes(1);
    expect(onDone).not.toHaveBeenCalled();
  });
});

describe('useVideoUpload — предпроверка размера', () => {
  it('файл больше потолка — сразу failed, без похода в сеть', () => {
    const file = makeFile(1);
    Object.defineProperty(file, 'size', { value: ANSWER_VIDEO_LIMITS.maxBytes + 1 });
    const transport = makeFakeTransport();
    const { result } = renderUpload(transport);

    act(() => result.current.selectFile(file));

    expect(result.current.state.phase).toBe('failed');
    expect(result.current.state.error?.message).toBe(ANSWER_VIDEO_TOO_LARGE_MESSAGE);
    expect(transport.start).not.toHaveBeenCalled();
  });

  it('потолок и текст берутся из параметров хука', () => {
    const transport = makeFakeTransport();
    const { result } = renderUpload(transport, {
      maxBytes: 10,
      tooLargeMessage: 'Много.',
    });

    act(() => result.current.selectFile(makeFile(11)));

    expect(result.current.state.error?.message).toBe('Много.');
    expect(transport.start).not.toHaveBeenCalled();
  });
});

describe('useVideoUpload — отмена', () => {
  it('cancel() в idle (файл ещё не выбран) — ничего не меняет', () => {
    const { result } = renderUpload();

    act(() => result.current.cancel());

    expect(result.current.state.phase).toBe('idle');
  });

  it('cancel() после done — готовый результат не откатывается', async () => {
    const { result } = renderUpload();
    act(() => result.current.selectFile(makeFile()));
    await waitFor(() => expect(result.current.state.phase).toBe('done'));

    act(() => result.current.cancel());

    expect(result.current.state.phase).toBe('done');
  });

  it('cancel держит phase cancelled, даже когда летящий запрос потом ответит', async () => {
    let resolveStart!: (session: VideoUploadSession) => void;
    const transport = makeFakeTransport({
      start: () =>
        new Promise((resolve) => {
          resolveStart = resolve;
        }),
    });
    const { result } = renderUpload(transport);

    act(() => result.current.selectFile(makeFile()));
    expect(result.current.state.phase).toBe('uploading');
    // Старт уходит не сразу: сначала считается отпечаток файла (асинхронно,
    // ADR-0165), а отменяем мы именно летящий запрос.
    await waitFor(() => expect(transport.start).toHaveBeenCalledTimes(1));

    act(() => result.current.cancel());
    expect(result.current.state.phase).toBe('cancelled');

    // Летящий («отменённый» только локально) старт всё же отвечает — не
    // должен вернуть состояние обратно в uploading/done.
    await act(async () => {
      resolveStart(fakeSession());
      await Promise.resolve();
    });
    expect(result.current.state.phase).toBe('cancelled');
    expect(transport.start).toHaveBeenCalledTimes(1);
  });

  it('выбор того же файла снова продолжает загрузку', async () => {
    const transport = makeFakeTransport({
      start: () => Promise.resolve(fakeSession([1, 2])),
    });
    const { result } = renderUpload(transport);
    const file = makeFile();

    act(() => result.current.selectFile(file));
    act(() => result.current.cancel());
    act(() => result.current.selectFile(file));

    await waitFor(() => expect(result.current.state.phase).toBe('done'));
  });
});

describe('useVideoUpload — экран не гаснет (ADR-0165)', () => {
  it('держит блокировку сна, пока загрузка идёт, и снимает после готово', async () => {
    const wakeLock = installFakeWakeLock();
    const { result } = renderUpload();

    act(() => result.current.selectFile(makeFile()));
    await waitFor(() => expect(wakeLock.request).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.state.phase).toBe('done'));

    expect(wakeLock.sentinels[0]?.released).toBe(true);
  });

  it('«Отменить» снимает блокировку, хотя запрос на сервер ещё в пути', async () => {
    const wakeLock = installFakeWakeLock();
    const transport = makeFakeTransport({ start: () => new Promise(() => {}) });
    const { result } = renderUpload(transport);

    act(() => result.current.selectFile(makeFile()));
    await waitFor(() => expect(wakeLock.sentinels).toHaveLength(1));
    act(() => result.current.cancel());

    expect(wakeLock.sentinels[0]?.released).toBe(true);
  });

  it('на паузе перед повтором блокировка держится: связь вернётся, а экран спит', async () => {
    const wakeLock = installFakeWakeLock();
    const { transport } = transportWithFlakyPart1();
    const { result } = renderUpload(transport);

    act(() => result.current.selectFile(makeFile()));
    await waitFor(() => expect(result.current.state.phase).toBe('waiting'));

    expect(wakeLock.request).toHaveBeenCalledTimes(1);
    expect(wakeLock.sentinels[0]?.released).toBe(false);
  });
});

// Сжатие в браузере (ADR-0165): настоящий перегон — compressVideo.test.ts, здесь
// подменённый `compress`, который тест отпускает сам.
describe('useVideoUpload — сжатие перед загрузкой', () => {
  const BIG_BYTES = 20 * 1024 * 1024;

  /** Файл «в 20 МиБ» без выделения памяти — хук смотрит только на `size`. */
  function bigFile(size = BIG_BYTES): File {
    const file = makeFile(1);
    Object.defineProperty(file, 'size', { value: size });
    return file;
  }

  function controlledCompress() {
    let options: Parameters<typeof compressVideo>[1] | undefined;
    let finish!: (result: CompressedVideo) => void;
    let fail!: (error: unknown) => void;
    const compress = vi.fn<typeof compressVideo>((_file, given) => {
      options = given;
      return new Promise<CompressedVideo>((resolve, reject) => {
        finish = resolve;
        fail = reject;
      });
    });
    return {
      compress,
      /** Сжатие кончилось: что уходит и с каким кодеком (ADR-0189). */
      finish: (file: Blob, codec?: VideoCodec) => finish({ file, codec }),
      fail: (error: unknown) => fail(error),
      options: () => options,
      /** Библиотека прочла кодек и решила перегонять (compressVideo.ts). */
      conversionStart: (canSkip: boolean) =>
        act(() => options?.onConversionStart?.({ canSkip })),
    };
  }

  beforeEach(() => {
    vi.stubGlobal('VideoEncoder', class {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('сжатие → загрузка сжатого → готово; на сервер уходит размер сжатого файла', async () => {
    const wakeLock = installFakeWakeLock();
    const { compress, finish, options } = controlledCompress();
    const transport = makeFakeTransport();
    const { result, onDone } = renderUpload(transport, { compress });

    act(() => result.current.selectFile(bigFile()));

    expect(result.current.state).toMatchObject({
      phase: 'compressing',
      totalBytes: BIG_BYTES,
      compressProgress: 0,
    });
    expect(transport.start).not.toHaveBeenCalled();
    // Экран не гаснет уже на сжатии: оно самое долгое.
    await waitFor(() => expect(wakeLock.sentinels).toHaveLength(1));

    act(() => options()?.onProgress(0.4));
    expect(result.current.state.compressProgress).toBe(0.4);
    expect(result.current.state.canSkipCompression).toBe(false);

    finish(new Blob([new Uint8Array(20)], { type: 'video/mp4' }));

    await waitFor(() => expect(result.current.state.phase).toBe('done'));
    expect(transport.start.mock.calls[0]?.[0].sizeBytes).toBe(20);
    expect(onDone).toHaveBeenCalledWith(FAKE_UPLOAD_RESULT);
    expect(wakeLock.sentinels[0]?.released).toBe(true);
  });

  it('сжать не вышло (вернулся исходник) — грузится исходник', async () => {
    const { compress, finish } = controlledCompress();
    const transport = makeFakeTransport();
    const { result } = renderUpload(transport, { compress });
    const file = makeFile(20);
    Object.defineProperty(file, 'size', { value: BIG_BYTES });

    act(() => result.current.selectFile(file));
    finish(file);

    await waitFor(() => expect(result.current.state.phase).toBe('done'));
    expect(transport.start.mock.calls[0]?.[0].sizeBytes).toBe(BIG_BYTES);
  });

  // ADR-0189: `complete` сообщает кодек того, что реально ушло на сервер.
  describe('кодек в complete', () => {
    async function uploadWith(
      outcome: (finish: (file: Blob, codec?: VideoCodec) => void, file: File) => void,
    ) {
      const { compress, finish } = controlledCompress();
      const transport = makeFakeTransport();
      const { result } = renderUpload(transport, { compress });
      const file = bigFile();

      act(() => result.current.selectFile(file));
      outcome(finish, file);

      await waitFor(() => expect(result.current.state.phase).toBe('done'));
      return transport.complete.mock.calls[0]?.[1];
    }

    it('перегнанный файл уходит с avc', async () => {
      const input = await uploadWith((finish) =>
        finish(new Blob([new Uint8Array(20)]), 'avc'),
      );

      expect(input?.codec).toBe('avc');
    });

    it('перегнать не вышло — уходит кодек исходника', async () => {
      const input = await uploadWith((finish, file) => finish(file, 'hevc'));

      expect(input?.codec).toBe('hevc');
    });

    it('кодек не известен — поля нет, видео завершается так же', async () => {
      const input = await uploadWith((finish, file) => finish(file));

      expect(input).not.toHaveProperty('codec', expect.anything());
      expect(input?.codec).toBeUndefined();
    });

    it('без сжатия вовсе (canCompress: false) кодек не сообщается', async () => {
      const transport = makeFakeTransport();
      const { result } = renderUpload(transport, { canCompress: false });

      act(() => result.current.selectFile(makeFile()));
      await waitFor(() => expect(result.current.state.phase).toBe('done'));

      expect(transport.complete.mock.calls[0]?.[1].codec).toBeUndefined();
    });

    it('«Отправить без сжатия» — исходник H.264, уходит с avc', async () => {
      const { compress, fail, conversionStart } = controlledCompress();
      const transport = makeFakeTransport();
      const { result } = renderUpload(transport, { compress });

      act(() => result.current.selectFile(bigFile()));
      conversionStart(true);
      act(() => result.current.skipCompression());
      fail(new DOMException('Сжатие отменено.', 'AbortError'));

      await waitFor(() => expect(result.current.state.phase).toBe('done'));
      expect(transport.complete.mock.calls[0]?.[1].codec).toBe('avc');
    });
  });

  it('исходник больше потолка, но сжатый проходит — принимается', async () => {
    const { compress, finish } = controlledCompress();
    const { result } = renderUpload(makeFakeTransport(), { compress });

    act(() => result.current.selectFile(bigFile(ANSWER_VIDEO_LIMITS.maxBytes + 1)));
    finish(new Blob([new Uint8Array(20)]));

    await waitFor(() => expect(result.current.state.phase).toBe('done'));
  });

  it('исходник больше потолка и не сжался — отказ прежним текстом, в сеть не ходит', async () => {
    const { compress, finish } = controlledCompress();
    const transport = makeFakeTransport();
    const { result } = renderUpload(transport, { compress });
    const file = bigFile(ANSWER_VIDEO_LIMITS.maxBytes + 1);

    act(() => result.current.selectFile(file));
    finish(file);

    await waitFor(() => expect(result.current.state.phase).toBe('failed'));
    expect(result.current.state.error?.message).toBe(ANSWER_VIDEO_TOO_LARGE_MESSAGE);
    expect(transport.start).not.toHaveBeenCalled();
  });

  it('«Отменить» во время сжатия: сигнал отменён, загрузка не начинается', async () => {
    const { compress, fail, options } = controlledCompress();
    const transport = makeFakeTransport();
    const { result } = renderUpload(transport, { compress });

    act(() => result.current.selectFile(bigFile()));
    act(() => result.current.cancel());

    expect(result.current.state.phase).toBe('cancelled');
    expect(options()?.signal.aborted).toBe(true);
    fail(new DOMException('Сжатие отменено.', 'AbortError'));
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.state.phase).toBe('cancelled');
    expect(transport.start).not.toHaveBeenCalled();
  });

  it('сжатие дошло до конца уже после «Отменить» — загрузка всё равно не начинается', async () => {
    const { compress, finish } = controlledCompress();
    const transport = makeFakeTransport();
    const { result } = renderUpload(transport, { compress });

    act(() => result.current.selectFile(bigFile()));
    act(() => result.current.cancel());
    finish(new Blob([new Uint8Array(20)]));
    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.state.phase).toBe('cancelled');
    expect(transport.start).not.toHaveBeenCalled();
  });

  describe('«Отправить без сжатия»', () => {
    it('сжатие оборвано, грузится исходник: start получает его размер', async () => {
      // Подменное сжатие отвергается отменой, как настоящее (compressVideo.ts).
      const compress = vi.fn<typeof compressVideo>(
        (_file, { signal, onConversionStart }) =>
          new Promise<CompressedVideo>((_resolve, reject) => {
            onConversionStart?.({ canSkip: true });
            signal.addEventListener('abort', () =>
              reject(new DOMException('Сжатие отменено.', 'AbortError')),
            );
          }),
      );
      const transport = makeFakeTransport();
      const { result, onDone } = renderUpload(transport, { compress });

      act(() => result.current.selectFile(bigFile()));
      expect(result.current.state.canSkipCompression).toBe(true);
      act(() => result.current.skipCompression());

      expect(compress.mock.calls[0]?.[1].signal.aborted).toBe(true);
      expect(result.current.state.canSkipCompression).toBe(false);
      await waitFor(() => expect(result.current.state.phase).toBe('done'));
      expect(transport.start).toHaveBeenCalledTimes(1);
      expect(transport.start.mock.calls[0]?.[0].sizeBytes).toBe(BIG_BYTES);
      expect(onDone).toHaveBeenCalledWith(FAKE_UPLOAD_RESULT);
    });

    it('после пропуска фаза — uploading, а не compressing', async () => {
      const { compress, fail, conversionStart } = controlledCompress();
      const { result } = renderUpload(
        makeFakeTransport({ start: () => new Promise(() => {}) }),
        { compress },
      );

      act(() => result.current.selectFile(bigFile()));
      conversionStart(true);
      act(() => result.current.skipCompression());
      fail(new DOMException('Сжатие отменено.', 'AbortError'));

      await waitFor(() => expect(result.current.state.phase).toBe('uploading'));
      expect(result.current.state).toMatchObject({
        totalBytes: BIG_BYTES,
        canSkipCompression: false,
      });
    });

    it('«Отменить» во время сжатия: загрузка не стартует, пропуск уже ничего не даёт', async () => {
      const { compress, fail, conversionStart } = controlledCompress();
      const transport = makeFakeTransport();
      const { result } = renderUpload(transport, { compress });

      act(() => result.current.selectFile(bigFile()));
      conversionStart(true);
      act(() => result.current.cancel());
      expect(result.current.state.canSkipCompression).toBe(false);
      act(() => result.current.skipCompression());
      fail(new DOMException('Сжатие отменено.', 'AbortError'));
      await act(async () => {
        await Promise.resolve();
      });

      expect(result.current.state.phase).toBe('cancelled');
      expect(transport.start).not.toHaveBeenCalled();
    });

    it.each([
      ['не больше потолка', ANSWER_VIDEO_LIMITS.maxBytes, true],
      ['больше потолка', ANSWER_VIDEO_LIMITS.maxBytes + 1, false],
    ])('исходник %s: кнопка доступна — %s', (_title, size, canSkip) => {
      const { compress, conversionStart } = controlledCompress();
      const { result } = renderUpload(makeFakeTransport(), { compress });

      act(() => result.current.selectFile(bigFile(size)));
      conversionStart(true);

      expect(result.current.state.phase).toBe('compressing');
      expect(result.current.state.canSkipCompression).toBe(canSkip);
    });

    it('исходник больше потолка: пропуск не рвёт сжатие', () => {
      const { compress, options, conversionStart } = controlledCompress();
      const { result } = renderUpload(makeFakeTransport(), { compress });

      act(() => result.current.selectFile(bigFile(ANSWER_VIDEO_LIMITS.maxBytes + 1)));
      conversionStart(true);
      act(() => result.current.skipCompression());

      expect(options()?.signal.aborted).toBe(false);
      expect(result.current.state.phase).toBe('compressing');
    });

    it('сжатие уже отдало файл, а пропуск дошёл следом — одна загрузка, сжатого', async () => {
      const { compress, finish, conversionStart } = controlledCompress();
      const transport = makeFakeTransport();
      const { result } = renderUpload(transport, { compress });

      act(() => result.current.selectFile(bigFile()));
      conversionStart(true);
      finish(new Blob([new Uint8Array(20)], { type: 'video/mp4' }));
      act(() => result.current.skipCompression());

      await waitFor(() => expect(result.current.state.phase).toBe('done'));
      expect(transport.start).toHaveBeenCalledTimes(1);
      expect(transport.start.mock.calls[0]?.[0].sizeBytes).toBe(20);
    });

    it('вне сжатия (идёт загрузка, покой) пропуск ничего не делает', async () => {
      const transport = makeFakeTransport({ start: () => new Promise(() => {}) });
      const { result } = renderUpload(transport, { canCompress: false });

      act(() => result.current.skipCompression());
      expect(result.current.state.phase).toBe('idle');

      act(() => result.current.selectFile(makeFile(20)));
      act(() => result.current.skipCompression());

      expect(result.current.state.phase).toBe('uploading');
      await waitFor(() => expect(transport.start).toHaveBeenCalledTimes(1));
    });

    it('пропуск относится к последнему выбранному файлу, а не к первому', async () => {
      const { compress, fail, options, conversionStart } = controlledCompress();
      const transport = makeFakeTransport();
      const { result } = renderUpload(transport, { compress });

      act(() => result.current.selectFile(bigFile(BIG_BYTES)));
      act(() => result.current.selectFile(bigFile(BIG_BYTES + 1)));
      conversionStart(true);
      act(() => result.current.skipCompression());
      expect(options()?.signal.aborted).toBe(true);
      fail(new DOMException('Сжатие отменено.', 'AbortError'));

      await waitFor(() => expect(result.current.state.phase).toBe('done'));
      expect(transport.start).toHaveBeenCalledTimes(1);
      expect(transport.start.mock.calls[0]?.[0].sizeBytes).toBe(BIG_BYTES + 1);
    });
  });

  // ADR-0188: кодек узнаёт только библиотека, поэтому и маленький файл сначала
  // проходит через сжатие. Маленький H.264 библиотека отдаёт нетронутым, и он
  // уходит дальше без кнопки и без ожидания.
  it('маленький H.264: сжатие вернуло исходник — он и грузится, без кнопки отказа', async () => {
    const { compress, finish } = controlledCompress();
    const transport = makeFakeTransport();
    const { result } = renderUpload(transport, { compress });
    const file = makeFile(20);

    act(() => result.current.selectFile(file));

    expect(compress).toHaveBeenCalledTimes(1);
    expect(result.current.state).toMatchObject({
      phase: 'compressing',
      canSkipCompression: false,
    });
    finish(file);

    await waitFor(() => expect(result.current.state.phase).toBe('done'));
    expect(transport.start.mock.calls[0]?.[0].sizeBytes).toBe(20);
  });

  describe('видео не в H.264 (ADR-0188)', () => {
    // 2026-10-29: HEVC с iPhone не открылся у ученика в MIUI Browser.
    it('маленький HEVC: уходит перегнанный файл, даже если он больше исходника', async () => {
      const { compress, finish, conversionStart } = controlledCompress();
      const transport = makeFakeTransport();
      const { result } = renderUpload(transport, { compress });

      act(() => result.current.selectFile(makeFile(20)));
      conversionStart(false);
      finish(new Blob([new Uint8Array(30)], { type: 'video/mp4' }));

      await waitFor(() => expect(result.current.state.phase).toBe('done'));
      expect(transport.start.mock.calls[0]?.[0].sizeBytes).toBe(30);
    });

    it('«Отправить без сжатия» не предлагается', () => {
      const { compress, conversionStart } = controlledCompress();
      const { result } = renderUpload(makeFakeTransport(), { compress });

      act(() => result.current.selectFile(bigFile()));
      conversionStart(false);

      expect(result.current.state).toMatchObject({
        phase: 'compressing',
        canSkipCompression: false,
      });
    });

    it('пропуск не рвёт перегон и не отправляет исходник', async () => {
      const { compress, finish, options, conversionStart } = controlledCompress();
      const transport = makeFakeTransport();
      const { result } = renderUpload(transport, { compress });

      act(() => result.current.selectFile(bigFile()));
      conversionStart(false);
      act(() => result.current.skipCompression());

      expect(options()?.signal.aborted).toBe(false);
      expect(result.current.state.phase).toBe('compressing');
      finish(new Blob([new Uint8Array(40)], { type: 'video/mp4' }));
      await waitFor(() => expect(result.current.state.phase).toBe('done'));
      expect(transport.start.mock.calls[0]?.[0].sizeBytes).toBe(40);
    });

    it('перегнать не вышло (в браузере нет декодера) — уходит исходник', async () => {
      const { compress, finish, conversionStart } = controlledCompress();
      const transport = makeFakeTransport();
      const { result } = renderUpload(transport, { compress });
      const file = makeFile(20);

      act(() => result.current.selectFile(file));
      conversionStart(false);
      finish(file);

      await waitFor(() => expect(result.current.state.phase).toBe('done'));
      expect(transport.start.mock.calls[0]?.[0].sizeBytes).toBe(20);
    });
  });

  describe('кнопка «Отправить без сжатия» до чтения кодека', () => {
    it('пока кодек не прочитан, кнопки нет и пропуск ничего не делает', () => {
      const { compress, options } = controlledCompress();
      const { result } = renderUpload(makeFakeTransport(), { compress });

      act(() => result.current.selectFile(bigFile()));
      expect(result.current.state.canSkipCompression).toBe(false);
      act(() => result.current.skipCompression());

      expect(options()?.signal.aborted).toBe(false);
      expect(result.current.state.phase).toBe('compressing');
    });

    it('кодек прочитан уже после «Отменить» — кнопка не появляется', () => {
      const { compress, conversionStart } = controlledCompress();
      const { result } = renderUpload(makeFakeTransport(), { compress });

      act(() => result.current.selectFile(bigFile()));
      act(() => result.current.cancel());
      conversionStart(true);

      expect(result.current.state).toMatchObject({
        phase: 'cancelled',
        canSkipCompression: false,
      });
    });
  });

  // ADR-0180: запись занятия — смонтированный файл до 2000 МБ, сжатие часа видео
  // держало бы результат в памяти вкладки. Остальные виды видео не затронуты.
  it('canCompress: false — большой файл грузится сразу, сжатие не зовётся', async () => {
    const { compress } = controlledCompress();
    const transport = makeFakeTransport();
    const { result, onDone } = renderUpload(transport, { compress, canCompress: false });

    act(() => result.current.selectFile(bigFile()));

    expect(result.current.state).toMatchObject({
      phase: 'uploading',
      totalBytes: BIG_BYTES,
    });
    expect(compress).not.toHaveBeenCalled();
    await waitFor(() => expect(result.current.state.phase).toBe('done'));
    expect(transport.start.mock.calls[0]?.[0].sizeBytes).toBe(BIG_BYTES);
    expect(onDone).toHaveBeenCalledWith(FAKE_UPLOAD_RESULT);
  });

  it('в браузере без WebCodecs сжатие пропускается и у большого файла', async () => {
    vi.unstubAllGlobals();
    const { compress } = controlledCompress();
    const transport = makeFakeTransport();
    const { result } = renderUpload(transport, { compress });

    act(() => result.current.selectFile(bigFile()));

    expect(result.current.state.phase).toBe('uploading');
    expect(compress).not.toHaveBeenCalled();
    await waitFor(() => expect(transport.start).toHaveBeenCalled());
  });
});

// Закрытие вкладки посреди загрузки браузер переспрашивает — у всех видов
// видео одинаково, потому что включает его общий хук (ADR-0165).
describe('useVideoUpload — предупреждение при закрытии вкладки', () => {
  function closeTab(): Event {
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    return event;
  }

  it('пока загрузка идёт — закрытие вкладки переспрашивается, после отмены — нет', () => {
    const transport = makeFakeTransport({ start: () => new Promise(() => {}) });
    const { result } = renderUpload(transport);

    expect(closeTab().defaultPrevented).toBe(false);
    act(() => result.current.selectFile(makeFile()));
    expect(closeTab().defaultPrevented).toBe(true);

    act(() => result.current.cancel());
    expect(closeTab().defaultPrevented).toBe(false);
  });

  it('после успешной загрузки предупреждение снято', async () => {
    const { result } = renderUpload();

    act(() => result.current.selectFile(makeFile()));
    await waitFor(() => expect(result.current.state.phase).toBe('done'));

    expect(closeTab().defaultPrevented).toBe(false);
  });
});

describe('useVideoUpload — reset', () => {
  it('забывает ошибку отказа: «Убрать видео» не оставляет старый текст', async () => {
    const transport = makeFakeTransport({
      uploadPart: () =>
        Promise.reject(
          new ApiError(ANSWER_VIDEO_PART_INVALID_MESSAGE, 400, 'invalid_input'),
        ),
    });
    const { result } = renderUpload(transport);
    act(() => result.current.selectFile(makeFile()));
    await waitFor(() => expect(result.current.state.phase).toBe('failed'));

    act(() => result.current.reset());

    expect(result.current.state).toMatchObject({ phase: 'idle', error: null });
  });

  it('обрывает идущую загрузку, и поздний ответ её не воскрешает', async () => {
    let resolveStart!: (session: VideoUploadSession) => void;
    const transport = makeFakeTransport({
      start: () =>
        new Promise((resolve) => {
          resolveStart = resolve;
        }),
    });
    const { result } = renderUpload(transport);
    act(() => result.current.selectFile(makeFile()));
    await waitFor(() => expect(transport.start).toHaveBeenCalledTimes(1));

    act(() => result.current.reset());
    await act(async () => {
      resolveStart(fakeSession());
      await Promise.resolve();
    });

    expect(result.current.state.phase).toBe('idle');
    expect(transport.uploadPart).not.toHaveBeenCalled();
  });
});
