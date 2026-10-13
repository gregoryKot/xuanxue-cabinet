import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type * as HttpModule from '../api/http';
import { ApiError } from '../api/http';
import {
  mockApiByPath,
  mockedApiFetch,
  resetApiFetchBetweenTests,
} from '../test-support/apiFetchMock';
import { POSTER_FROM_URL_TIMEOUT_MS } from '../video-upload/videoPosterPlan';
import { useExamVideoPosterBackfill } from './useExamVideoPosterBackfill';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();

const POSTER = 'AQID';
const VIDEOS = [{ id: 'a' }, { id: 'b' }];

function setup(capture = vi.fn(() => Promise.resolve<string | null>(POSTER))) {
  const onFinished = vi.fn();
  const hook = renderHook(() => useExamVideoPosterBackfill({ onFinished, capture }));
  return { ...hook, onFinished, capture };
}

describe('useExamVideoPosterBackfill', () => {
  it('до нажатия — ничего не идёт, сети нет', () => {
    mockApiByPath({});

    const { result } = setup();

    expect(result.current.state.phase).toBe('idle');
    expect(mockedApiFetch).not.toHaveBeenCalled();
  });

  it('start: берёт байты по адресу кабинета, пишет кадр PUT-ом и зовёт onFinished', async () => {
    mockApiByPath({
      '/exam-videos/without-poster': VIDEOS,
      '/exam-videos/a/poster': { id: 'a' },
      '/exam-videos/b/poster': { id: 'b' },
    });
    const { result, capture, onFinished } = setup();

    act(() => result.current.start(2));
    expect(result.current.state).toMatchObject({ phase: 'running', total: 2 });

    await waitFor(() => expect(result.current.state.phase).toBe('done'));

    expect(result.current.state).toEqual({
      phase: 'done',
      done: 2,
      failed: 0,
      total: 2,
      error: null,
    });
    expect(capture).toHaveBeenCalledWith(
      '/api/exam-videos/a/bytes',
      expect.objectContaining({
        signal: expect.any(AbortSignal) as AbortSignal,
        timeoutMs: POSTER_FROM_URL_TIMEOUT_MS,
      }),
    );
    const put = mockedApiFetch.mock.calls.find(
      ([path]) => path === '/exam-videos/a/poster',
    );
    expect(put?.[1]).toMatchObject({ method: 'PUT', body: { poster: POSTER } });
    expect(onFinished).toHaveBeenCalledTimes(1);
  });

  it('кадр не снялся — «не вышло», запись не уходит', async () => {
    mockApiByPath({ '/exam-videos/without-poster': VIDEOS });
    const { result } = setup(vi.fn(() => Promise.resolve(null)));

    act(() => result.current.start(null));
    await waitFor(() => expect(result.current.state.phase).toBe('done'));

    expect(result.current.state).toMatchObject({ done: 0, failed: 2, total: 2 });
    const paths = mockedApiFetch.mock.calls.map(([path]) => path);
    expect(paths.some((path) => path.endsWith('/poster'))).toBe(false);
  });

  it('403 на записи — прогон стоит с текстом, onFinished всё равно зовётся', async () => {
    mockApiByPath({
      '/exam-videos/without-poster': VIDEOS,
      '/exam-videos/a/poster': new ApiError('Нет прав', 403, 'forbidden'),
    });
    const { result, onFinished } = setup();

    act(() => result.current.start(2));
    await waitFor(() => expect(result.current.state.phase).toBe('done'));

    expect(result.current.state.error).toMatch(/Войдите заново/);
    expect(onFinished).toHaveBeenCalledTimes(1);
  });

  it('второе нажатие во время прогона ничего не запускает', async () => {
    mockApiByPath({
      '/exam-videos/without-poster': [{ id: 'a' }],
      '/exam-videos/a/poster': { id: 'a' },
    });
    const { result, capture } = setup();

    act(() => {
      result.current.start(1);
      result.current.start(1);
    });
    await waitFor(() => expect(result.current.state.phase).toBe('done'));

    expect(capture).toHaveBeenCalledTimes(1);
  });

  it('экран закрыли посреди прогона — запросы оборваны, onFinished не зовётся', async () => {
    mockApiByPath({ '/exam-videos/without-poster': VIDEOS });
    let capturedSignal: AbortSignal | undefined;
    // Снимок, как настоящий captureVideoPoster, по отмене отдаёт null, не бросает:
    // прогон после этого обязан выйти молча, не трогая состояние снятого экрана.
    const capture = vi.fn((_src: string, options?: { signal?: AbortSignal }) => {
      capturedSignal = options?.signal;
      return new Promise<string | null>((resolve) => {
        options?.signal?.addEventListener('abort', () => resolve(null), { once: true });
      });
    });
    const { result, unmount, onFinished } = setup(capture);

    act(() => result.current.start(2));
    await waitFor(() => expect(capture).toHaveBeenCalled());
    unmount();

    expect(capturedSignal?.aborted).toBe(true);
    await act(() => Promise.resolve());
    expect(onFinished).not.toHaveBeenCalled();
    expect(capture).toHaveBeenCalledTimes(1);
  });
});
