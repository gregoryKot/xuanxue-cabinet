// Состояние загрузки напрямую через хук, на фейковом транспорте
// (test-support/fakeVideoTransport.ts): сеть не нужна, ответы сервера —
// значения, число вызовов — `vi.fn`. Настоящие маршруты ответа ученика —
// attempt/answerVideoTransport.test.ts. Сеть не подменяется через
// `mockResolvedValueOnce` вовсе (check-once-mock-ratchet.mjs).
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  ANSWER_VIDEO_LIMITS,
  ANSWER_VIDEO_PART_INVALID_MESSAGE,
  ANSWER_VIDEO_TOO_LARGE_MESSAGE,
} from '@xuanxue/shared';
import { ApiError } from '../api/http';
import {
  FAKE_UPLOAD_RESULT,
  fakeSession,
  fakeSessionUpTo,
  makeFakeTransport,
  type FakeUploadResult,
} from '../test-support/fakeVideoTransport';
import { useVideoUpload, type UseVideoUploadOptions } from './useVideoUpload';
import type { VideoUploadSession } from './videoUploadTypes';

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
