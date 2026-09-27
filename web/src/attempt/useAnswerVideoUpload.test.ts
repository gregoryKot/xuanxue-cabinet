// Ответ по точному пути части (не по общему префиксу): три части одного
// вопроса возвращают разный `receivedParts`, поэтому здесь свой
// `mockImplementation` поверх `mockedApiFetch`, а не `mockApiByPath` — та
// даёт один статичный ответ на префикс, разбор — apiFetchMock.ts.
// `mockResolvedValueOnce`/`mockRejectedValueOnce` не используются вовсе
// (check-once-mock-ratchet.mjs).
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  ANSWER_VIDEO_LIMITS,
  ANSWER_VIDEO_PART_INVALID_MESSAGE,
  ANSWER_VIDEO_TOO_LARGE_MESSAGE,
  type AnswerVideoUploadDto,
  type ExamMediaDto,
} from '@xuanxue/shared';
import {
  answerVideoCompletePath,
  answerVideoPartPath,
  attemptAnswerVideoStartPath,
} from '../api/answerVideoPaths';
import type * as HttpModule from '../api/http';
import { ApiError } from '../api/http';
import { mockedApiFetch, resetApiFetchBetweenTests } from '../test-support/apiFetchMock';
import { useAnswerVideoUpload } from './useAnswerVideoUpload';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();

const ATTEMPT_ID = 'a1';
const ITEM_ID = 'q1';
const START_PATH = attemptAnswerVideoStartPath(ATTEMPT_ID);

function makeFile(bytes = 20): File {
  return new File([new Uint8Array(bytes)], 'form.mp4', { type: 'video/mp4' });
}

function startDto(receivedParts: number[] = []): AnswerVideoUploadDto {
  return { id: 'u1', partBytes: 8, partCount: 3, receivedParts };
}

const MEDIA: ExamMediaDto = {
  id: 'm1',
  attemptId: ATTEMPT_ID,
  itemId: ITEM_ID,
  kind: 'file',
  answerVideoId: 'u1',
  receivedAt: '2026-09-27T10:00:00Z',
};

/** Никогда не резолвится — тесты продвигают паузу сами через `resumeNow()`,
 * реальные таймеры не участвуют (CLAUDE.md «Детерминизм»). */
function neverSleep(): Promise<void> {
  return new Promise(() => {});
}

describe('useAnswerVideoUpload — happy path', () => {
  it('старт → все части → complete → applyMedia, phase done', async () => {
    mockedApiFetch.mockImplementation((path: string) => {
      if (path === START_PATH) return Promise.resolve(startDto());
      if (path === answerVideoPartPath('u1', 1)) return Promise.resolve(startDto([1]));
      if (path === answerVideoPartPath('u1', 2)) return Promise.resolve(startDto([1, 2]));
      if (path === answerVideoPartPath('u1', 3))
        return Promise.resolve(startDto([1, 2, 3]));
      if (path === answerVideoCompletePath('u1')) return Promise.resolve(MEDIA);
      return Promise.reject(new Error(`неожиданный путь: ${path}`));
    });
    const applyMedia = vi.fn();
    const { result } = renderHook(() =>
      useAnswerVideoUpload({
        attemptId: ATTEMPT_ID,
        itemId: ITEM_ID,
        applyMedia,
        sleep: neverSleep,
      }),
    );

    act(() => result.current.selectFile(makeFile()));

    await waitFor(() => expect(result.current.state.phase).toBe('done'));
    expect(applyMedia).toHaveBeenCalledWith(MEDIA);
    expect(mockedApiFetch).toHaveBeenCalledTimes(5); // старт + 3 части + complete
  });
});

describe('useAnswerVideoUpload — продолжение (receivedParts с сервера)', () => {
  it('не шлёт уже принятую часть 1, продолжает со 2-й', async () => {
    mockedApiFetch.mockImplementation((path: string) => {
      if (path === START_PATH) return Promise.resolve(startDto([1]));
      if (path === answerVideoPartPath('u1', 2)) return Promise.resolve(startDto([1, 2]));
      if (path === answerVideoPartPath('u1', 3))
        return Promise.resolve(startDto([1, 2, 3]));
      if (path === answerVideoCompletePath('u1')) return Promise.resolve(MEDIA);
      return Promise.reject(new Error(`неожиданный путь: ${path}`));
    });
    const applyMedia = vi.fn();
    const { result } = renderHook(() =>
      useAnswerVideoUpload({
        attemptId: ATTEMPT_ID,
        itemId: ITEM_ID,
        applyMedia,
        sleep: neverSleep,
      }),
    );

    act(() => result.current.selectFile(makeFile()));

    await waitFor(() => expect(result.current.state.phase).toBe('done'));
    expect(mockedApiFetch).not.toHaveBeenCalledWith(
      answerVideoPartPath('u1', 1),
      expect.anything(),
    );
  });
});

describe('useAnswerVideoUpload — сетевой сбой', () => {
  it('уходит в waiting и продолжает после «Продолжить сейчас»', async () => {
    let part1Attempts = 0;
    mockedApiFetch.mockImplementation((path: string) => {
      if (path === START_PATH) return Promise.resolve(startDto());
      if (path === answerVideoPartPath('u1', 1)) {
        part1Attempts += 1;
        if (part1Attempts === 1) {
          return Promise.reject(new ApiError('Нет связи с сервером.', 0, 'network'));
        }
        return Promise.resolve(startDto([1]));
      }
      if (path === answerVideoPartPath('u1', 2)) return Promise.resolve(startDto([1, 2]));
      if (path === answerVideoPartPath('u1', 3))
        return Promise.resolve(startDto([1, 2, 3]));
      if (path === answerVideoCompletePath('u1')) return Promise.resolve(MEDIA);
      return Promise.reject(new Error(`неожиданный путь: ${path}`));
    });
    const applyMedia = vi.fn();
    const { result } = renderHook(() =>
      useAnswerVideoUpload({
        attemptId: ATTEMPT_ID,
        itemId: ITEM_ID,
        applyMedia,
        sleep: neverSleep,
      }),
    );

    act(() => result.current.selectFile(makeFile()));
    await waitFor(() => expect(result.current.state.phase).toBe('waiting'));

    act(() => result.current.resumeNow());

    await waitFor(() => expect(result.current.state.phase).toBe('done'));
    expect(part1Attempts).toBe(2);
  });
});

describe('useAnswerVideoUpload — пауза по умолчанию (realSleep, без инъекции)', () => {
  it('без своего sleep продолжает после настоящего таймера', async () => {
    vi.useFakeTimers();
    let part1Attempts = 0;
    mockedApiFetch.mockImplementation((path: string) => {
      if (path === START_PATH) return Promise.resolve(startDto());
      if (path === answerVideoPartPath('u1', 1)) {
        part1Attempts += 1;
        if (part1Attempts === 1) {
          return Promise.reject(new ApiError('Нет связи с сервером.', 0, 'network'));
        }
        return Promise.resolve(startDto([1]));
      }
      if (path === answerVideoPartPath('u1', 2)) return Promise.resolve(startDto([1, 2]));
      if (path === answerVideoPartPath('u1', 3))
        return Promise.resolve(startDto([1, 2, 3]));
      if (path === answerVideoCompletePath('u1')) return Promise.resolve(MEDIA);
      return Promise.reject(new Error(`неожиданный путь: ${path}`));
    });
    const applyMedia = vi.fn();
    const { result } = renderHook(() =>
      useAnswerVideoUpload({ attemptId: ATTEMPT_ID, itemId: ITEM_ID, applyMedia }),
    );

    act(() => result.current.selectFile(makeFile()));
    await vi.waitFor(() => expect(result.current.state.phase).toBe('waiting'));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    await vi.waitFor(() => expect(result.current.state.phase).toBe('done'));
    vi.useRealTimers();
  });
});

describe('useAnswerVideoUpload — отказ сервера (4xx)', () => {
  it('phase failed с текстом сервера, повтора нет', async () => {
    mockedApiFetch.mockImplementation((path: string) => {
      if (path === START_PATH) return Promise.resolve(startDto());
      if (path === answerVideoPartPath('u1', 1)) {
        return Promise.reject(
          new ApiError(ANSWER_VIDEO_PART_INVALID_MESSAGE, 400, 'invalid_input'),
        );
      }
      return Promise.reject(new Error(`неожиданный путь: ${path}`));
    });
    const applyMedia = vi.fn();
    const { result } = renderHook(() =>
      useAnswerVideoUpload({
        attemptId: ATTEMPT_ID,
        itemId: ITEM_ID,
        applyMedia,
        sleep: neverSleep,
      }),
    );

    act(() => result.current.selectFile(makeFile()));

    await waitFor(() => expect(result.current.state.phase).toBe('failed'));
    expect(result.current.state.error?.message).toBe(ANSWER_VIDEO_PART_INVALID_MESSAGE);
    expect(applyMedia).not.toHaveBeenCalled();
  });
});

describe('useAnswerVideoUpload — предпроверка размера', () => {
  it('файл больше 1 ГБ — сразу failed, без похода в сеть', () => {
    const file = makeFile(1);
    Object.defineProperty(file, 'size', { value: ANSWER_VIDEO_LIMITS.maxBytes + 1 });
    const applyMedia = vi.fn();
    const { result } = renderHook(() =>
      useAnswerVideoUpload({
        attemptId: ATTEMPT_ID,
        itemId: ITEM_ID,
        applyMedia,
        sleep: neverSleep,
      }),
    );

    act(() => result.current.selectFile(file));

    expect(result.current.state.phase).toBe('failed');
    expect(result.current.state.error?.message).toBe(ANSWER_VIDEO_TOO_LARGE_MESSAGE);
    expect(mockedApiFetch).not.toHaveBeenCalled();
  });
});

describe('useAnswerVideoUpload — отмена', () => {
  it('cancel() в idle (файл ещё не выбран) — ничего не меняет', () => {
    const applyMedia = vi.fn();
    const { result } = renderHook(() =>
      useAnswerVideoUpload({
        attemptId: ATTEMPT_ID,
        itemId: ITEM_ID,
        applyMedia,
        sleep: neverSleep,
      }),
    );

    act(() => result.current.cancel());

    expect(result.current.state.phase).toBe('idle');
  });

  it('cancel() после done — готовый результат не откатывается', async () => {
    mockedApiFetch.mockImplementation((path: string) => {
      if (path === START_PATH) return Promise.resolve(startDto());
      if (path === answerVideoPartPath('u1', 1)) return Promise.resolve(startDto([1]));
      if (path === answerVideoPartPath('u1', 2)) return Promise.resolve(startDto([1, 2]));
      if (path === answerVideoPartPath('u1', 3))
        return Promise.resolve(startDto([1, 2, 3]));
      if (path === answerVideoCompletePath('u1')) return Promise.resolve(MEDIA);
      return Promise.reject(new Error(`неожиданный путь: ${path}`));
    });
    const applyMedia = vi.fn();
    const { result } = renderHook(() =>
      useAnswerVideoUpload({
        attemptId: ATTEMPT_ID,
        itemId: ITEM_ID,
        applyMedia,
        sleep: neverSleep,
      }),
    );
    act(() => result.current.selectFile(makeFile()));
    await waitFor(() => expect(result.current.state.phase).toBe('done'));

    act(() => result.current.cancel());

    expect(result.current.state.phase).toBe('done');
  });

  it('cancel держит phase cancelled, даже когда летящий запрос потом ответит', async () => {
    let resolveStart!: (dto: AnswerVideoUploadDto) => void;
    mockedApiFetch.mockImplementation((path: string) => {
      if (path === START_PATH) {
        return new Promise((resolve) => {
          resolveStart = resolve;
        });
      }
      return Promise.reject(new Error(`неожиданный путь: ${path}`));
    });
    const applyMedia = vi.fn();
    const { result } = renderHook(() =>
      useAnswerVideoUpload({
        attemptId: ATTEMPT_ID,
        itemId: ITEM_ID,
        applyMedia,
        sleep: neverSleep,
      }),
    );

    act(() => result.current.selectFile(makeFile()));
    expect(result.current.state.phase).toBe('uploading');

    act(() => result.current.cancel());
    expect(result.current.state.phase).toBe('cancelled');

    // Летящий («отменённый» только локально) старт всё же отвечает — не
    // должен вернуть состояние обратно в uploading/done.
    await act(async () => {
      resolveStart(startDto());
      await Promise.resolve();
    });
    expect(result.current.state.phase).toBe('cancelled');
    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
  });

  it('выбор того же файла снова продолжает загрузку', async () => {
    mockedApiFetch.mockImplementation((path: string) => {
      if (path === START_PATH) return Promise.resolve(startDto([1, 2]));
      if (path === answerVideoPartPath('u1', 3))
        return Promise.resolve(startDto([1, 2, 3]));
      if (path === answerVideoCompletePath('u1')) return Promise.resolve(MEDIA);
      return Promise.reject(new Error(`неожиданный путь: ${path}`));
    });
    const applyMedia = vi.fn();
    const { result } = renderHook(() =>
      useAnswerVideoUpload({
        attemptId: ATTEMPT_ID,
        itemId: ITEM_ID,
        applyMedia,
        sleep: neverSleep,
      }),
    );
    const file = makeFile();

    act(() => result.current.selectFile(file));
    act(() => result.current.cancel());
    act(() => result.current.selectFile(file));

    await waitFor(() => expect(result.current.state.phase).toBe('done'));
  });
});
