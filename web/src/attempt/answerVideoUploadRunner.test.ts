// Прогон загрузки напрямую, без React (useAnswerVideoUpload.test.ts уже
// покрывает его через хук) — здесь controllable isCancelled/waitForResume,
// чтобы дотянуться до веток, которые через хук воспроизвести неудобно:
// отмена ровно в момент сбоя запроса и отмена, случившаяся во время паузы.
import { describe, expect, it, vi } from 'vitest';
import type { AnswerVideoUploadDto, ExamMediaDto } from '@xuanxue/shared';
import { apiRoutePath } from '../api/apiRoute';
import type * as HttpModule from '../api/http';
import { ApiError } from '../api/http';
import { mockedApiFetch, resetApiFetchBetweenTests } from '../test-support/apiFetchMock';
import { runAnswerVideoUpload } from './answerVideoUploadRunner';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();

const ATTEMPT_ID = 'a1';
const ITEM_ID = 'q1';
const START_PATH = apiRoutePath('POST /attempts/:id/answer-video', {
  params: { id: ATTEMPT_ID },
});

function answerVideoPartPath(uploadId: string, partNumber: number): string {
  return apiRoutePath('PUT /answer-videos/:id/parts/:n', {
    params: { id: uploadId, n: String(partNumber) },
  });
}

function answerVideoCompletePath(uploadId: string): string {
  return apiRoutePath('POST /answer-videos/:id/complete', { params: { id: uploadId } });
}

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

function baseParams(overrides: Partial<Parameters<typeof runAnswerVideoUpload>[0]> = {}) {
  return {
    attemptId: ATTEMPT_ID,
    itemId: ITEM_ID,
    file: makeFile(),
    signal: new AbortController().signal,
    isCancelled: () => false,
    onProgress: vi.fn(),
    waitForResume: () => Promise.resolve(),
    onFailed: vi.fn(),
    onDone: vi.fn(),
    ...overrides,
  };
}

describe('runAnswerVideoUpload — отмена посреди цикла частей', () => {
  it('isCancelled() стал true между частями — выходит, не шлёт следующую', async () => {
    let cancelled = false;
    let progressCalls = 0;
    mockedApiFetch.mockImplementation((path: string) => {
      if (path === START_PATH) return Promise.resolve(startDto());
      if (path === answerVideoPartPath('u1', 1)) return Promise.resolve(startDto([1]));
      return Promise.reject(new Error(`не должно было позвать: ${path}`));
    });
    const onDone = vi.fn();

    await runAnswerVideoUpload(
      baseParams({
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
    expect(mockedApiFetch).toHaveBeenCalledTimes(2); // старт + часть 1, не больше
  });
});

describe('runAnswerVideoUpload — отмена ровно в момент сбоя запроса', () => {
  it('катч видит isCancelled() true — выходит без onFailed и без паузы', async () => {
    let cancelled = false;
    mockedApiFetch.mockImplementation((path: string) => {
      if (path === START_PATH) {
        cancelled = true;
        return Promise.reject(new ApiError('Нет связи с сервером.', 0, 'network'));
      }
      return Promise.reject(new Error(`не должно было позвать: ${path}`));
    });
    const onFailed = vi.fn();
    const waitForResume = vi.fn().mockResolvedValue(undefined);

    await runAnswerVideoUpload(
      baseParams({ isCancelled: () => cancelled, onFailed, waitForResume }),
    );

    expect(onFailed).not.toHaveBeenCalled();
    expect(waitForResume).not.toHaveBeenCalled();
  });
});

describe('runAnswerVideoUpload — отмена во время паузы ожидания', () => {
  it('после waitForResume видит isCancelled() true — не повторяет шаг', async () => {
    let attempts = 0;
    let cancelledAfterWait = false;
    mockedApiFetch.mockImplementation((path: string) => {
      if (path === START_PATH) {
        attempts += 1;
        if (attempts === 1) {
          return Promise.reject(new ApiError('Нет связи с сервером.', 0, 'network'));
        }
        return Promise.reject(new Error('не должно было повториться после отмены'));
      }
      return Promise.reject(new Error(`не должно было позвать: ${path}`));
    });
    const onFailed = vi.fn();
    const onDone = vi.fn();

    await runAnswerVideoUpload(
      baseParams({
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

describe('runAnswerVideoUpload — happy path напрямую', () => {
  it('старт → части → complete → onDone', async () => {
    mockedApiFetch.mockImplementation((path: string) => {
      if (path === START_PATH) return Promise.resolve(startDto());
      if (path === answerVideoPartPath('u1', 1)) return Promise.resolve(startDto([1]));
      if (path === answerVideoPartPath('u1', 2)) return Promise.resolve(startDto([1, 2]));
      if (path === answerVideoPartPath('u1', 3))
        return Promise.resolve(startDto([1, 2, 3]));
      if (path === answerVideoCompletePath('u1')) return Promise.resolve(MEDIA);
      return Promise.reject(new Error(`неожиданный путь: ${path}`));
    });
    const onDone = vi.fn();

    await runAnswerVideoUpload(baseParams({ onDone }));

    expect(onDone).toHaveBeenCalledWith(MEDIA);
  });
});
