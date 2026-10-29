// Хук «Перегнать видео» (ADR-0189) на мок-сети. Тяжёлые шаги — чтение кодека,
// скачивание с перегоном, загрузка копии — подменены через
// examVideoCodecBackfillDeps.ts: настоящие ждут WebCodecs; их собственные тесты —
// в video-upload/. Маршруты списка, записи кодека и подмены идут через apiFetch.
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as HttpModule from '../api/http';
import { ApiError } from '../api/http';
import {
  mockApiByPath,
  mockedApiFetch,
  resetApiFetchBetweenTests,
} from '../test-support/apiFetchMock';
import {
  installFakeWakeLock,
  removeFakeWakeLockAfterEach,
} from '../test-support/fakeWakeLock';
import type { VideoProbe } from '../video-upload/probeVideoCodec';
import { makeCodecBackfillDeps } from './examVideoCodecBackfillDeps';
import { useExamVideoCodecBackfill } from './useExamVideoCodecBackfill';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});
vi.mock('./examVideoCodecBackfillDeps', () => ({ makeCodecBackfillDeps: vi.fn() }));

resetApiFetchBetweenTests();
removeFakeWakeLockAfterEach();
afterEach(() => {
  vi.useRealTimers();
});

const HEVC: VideoProbe = { codec: 'hevc', canConvert: true };
const VIDEOS = [{ id: 'a' }, { id: 'b' }];

function copy(): Blob {
  return new Blob([new Uint8Array(4)], { type: 'video/mp4' });
}

function fakeDeps(overrides: Partial<ReturnType<typeof makeCodecBackfillDeps>> = {}) {
  const deps = {
    probe: vi.fn((_id: string) => Promise.resolve(HEVC)),
    convert: vi.fn((_id: string) => Promise.resolve<Blob | null>(copy())),
    upload: vi.fn((file: Blob) => Promise.resolve({ id: 'new', sizeBytes: file.size })),
    ...overrides,
  };
  vi.mocked(makeCodecBackfillDeps).mockReturnValue(deps);
  return deps;
}

function setup() {
  const onFinished = vi.fn();
  const hook = renderHook(() => useExamVideoCodecBackfill({ onFinished }));
  return { ...hook, onFinished };
}

describe('useExamVideoCodecBackfill', () => {
  it('до нажатия — ничего не идёт, сети нет', () => {
    mockApiByPath({});
    fakeDeps();

    const { result } = setup();

    expect(result.current.state.phase).toBe('idle');
    expect(mockedApiFetch).not.toHaveBeenCalled();
  });

  it('start: список → перегон → загрузка → подмена, затем onFinished', async () => {
    mockApiByPath({
      '/exam-videos/codec-pending': VIDEOS,
      '/exam-videos/a/replace': { id: 'a' },
      '/exam-videos/b/replace': { id: 'b' },
    });
    const deps = fakeDeps();
    const { result, onFinished } = setup();

    act(() => result.current.start(2));
    expect(result.current.state).toMatchObject({ phase: 'running', total: 2 });
    await waitFor(() => expect(result.current.state.phase).toBe('done'));

    expect(result.current.state).toEqual({
      phase: 'done',
      converted: 2,
      alreadyH264: 0,
      failed: 0,
      total: 2,
      error: null,
    });
    expect(deps.convert).toHaveBeenCalledWith('a', expect.any(AbortSignal));
    const replace = mockedApiFetch.mock.calls.find(
      ([path]) => path === '/exam-videos/a/replace',
    );
    expect(replace?.[1]).toMatchObject({
      method: 'POST',
      body: { replacementId: 'new' },
    });
    expect(onFinished).toHaveBeenCalledTimes(1);
  });

  it('загрузке копии отдаётся пауза повтора, общая с формой', async () => {
    mockApiByPath({ '/exam-videos/codec-pending': [] });
    fakeDeps();
    const { result } = setup();

    act(() => result.current.start(null));
    await waitFor(() => expect(result.current.state.phase).toBe('done'));

    expect(makeCodecBackfillDeps).toHaveBeenCalledWith(expect.any(Function));
  });

  it('уже H.264 — кодек пишется PUT-ом, файл не трогается', async () => {
    mockApiByPath({
      '/exam-videos/codec-pending': [{ id: 'a' }],
      '/exam-videos/a/codec': { id: 'a' },
    });
    const deps = fakeDeps({
      probe: vi.fn(() => Promise.resolve<VideoProbe>({ codec: 'avc', canConvert: true })),
    });
    const { result } = setup();

    act(() => result.current.start(1));
    await waitFor(() => expect(result.current.state.phase).toBe('done'));

    expect(result.current.state).toMatchObject({ alreadyH264: 1, converted: 0 });
    const put = mockedApiFetch.mock.calls.find(
      ([path]) => path === '/exam-videos/a/codec',
    );
    expect(put?.[1]).toMatchObject({ method: 'PUT', body: { codec: 'avc' } });
    expect(deps.convert).not.toHaveBeenCalled();
  });

  it('перегнать не вышло — кодек оригинала записан, подмены нет', async () => {
    mockApiByPath({
      '/exam-videos/codec-pending': [{ id: 'a' }],
      '/exam-videos/a/codec': { id: 'a' },
    });
    fakeDeps({ convert: vi.fn(() => Promise.resolve(null)) });
    const { result } = setup();

    act(() => result.current.start(1));
    await waitFor(() => expect(result.current.state.phase).toBe('done'));

    expect(result.current.state).toMatchObject({ converted: 0, failed: 1 });
    const paths = mockedApiFetch.mock.calls.map(([path]) => path);
    expect(paths).toContain('/exam-videos/a/codec');
    expect(paths.some((path) => path.endsWith('/replace'))).toBe(false);
    const put = mockedApiFetch.mock.calls.find(
      ([path]) => path === '/exam-videos/a/codec',
    );
    expect(put?.[1]).toMatchObject({ body: { codec: 'hevc' } });
  });

  it('403 на подмене — прогон стоит с текстом, onFinished всё равно зовётся', async () => {
    mockApiByPath({
      '/exam-videos/codec-pending': VIDEOS,
      '/exam-videos/a/replace': new ApiError('Нет прав', 403, 'forbidden'),
    });
    fakeDeps();
    const { result, onFinished } = setup();

    act(() => result.current.start(2));
    await waitFor(() => expect(result.current.state.phase).toBe('done'));

    expect(result.current.state.error).toMatch(/Войдите заново/);
    expect(onFinished).toHaveBeenCalledTimes(1);
  });

  it('второе нажатие во время прогона ничего не запускает', async () => {
    mockApiByPath({
      '/exam-videos/codec-pending': [{ id: 'a' }],
      '/exam-videos/a/replace': { id: 'a' },
    });
    const deps = fakeDeps();
    const { result } = setup();

    act(() => {
      result.current.start(1);
      result.current.start(1);
    });
    await waitFor(() => expect(result.current.state.phase).toBe('done'));

    expect(deps.convert).toHaveBeenCalledTimes(1);
  });

  it('пауза повтора загрузки: возврат сети снимает её, не дожидаясь таймера', async () => {
    vi.useFakeTimers();
    mockApiByPath({ '/exam-videos/codec-pending': [] });
    fakeDeps();
    const { result } = setup();
    act(() => result.current.start(null));
    const waitForResume = vi.mocked(makeCodecBackfillDeps).mock.lastCall?.[0];
    let isResumed = false;

    const pause = waitForResume?.(30)?.then(() => {
      isResumed = true;
    });
    await Promise.resolve();
    expect(isResumed).toBe(false);
    window.dispatchEvent(new Event('online'));
    await pause;

    expect(isResumed).toBe(true);
  });

  it('экран закрыли посреди прогона — перегон оборван, onFinished не зовётся', async () => {
    mockApiByPath({ '/exam-videos/codec-pending': VIDEOS });
    let seen: AbortSignal | undefined;
    // Как настоящий перегон: по отмене отвергается отменой.
    const convert = vi.fn(
      (_id: string, signal: AbortSignal) =>
        new Promise<Blob | null>((_resolve, reject) => {
          seen = signal;
          signal.addEventListener(
            'abort',
            () => reject(new DOMException('Сжатие отменено.', 'AbortError')),
            { once: true },
          );
        }),
    );
    fakeDeps({ convert });
    const { result, unmount, onFinished } = setup();

    act(() => result.current.start(2));
    await waitFor(() => expect(convert).toHaveBeenCalled());
    unmount();

    expect(seen?.aborted).toBe(true);
    await act(() => Promise.resolve());
    expect(onFinished).not.toHaveBeenCalled();
    expect(convert).toHaveBeenCalledTimes(1);
  });

  it('пока идёт прогон — экран не гаснет и закрытие вкладки переспросят; после — нет', async () => {
    const wakeLock = installFakeWakeLock();
    mockApiByPath({
      '/exam-videos/codec-pending': [{ id: 'a' }],
      '/exam-videos/a/replace': { id: 'a' },
    });
    let finishConvert!: (file: Blob) => void;
    fakeDeps({
      convert: vi.fn(
        () =>
          new Promise<Blob | null>((resolve) => {
            finishConvert = resolve;
          }),
      ),
    });
    const { result } = setup();

    act(() => result.current.start(1));
    await waitFor(() => expect(wakeLock.sentinels).toHaveLength(1));
    const whileRunning = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(whileRunning);
    expect(whileRunning.defaultPrevented).toBe(true);

    act(() => finishConvert(copy()));
    await waitFor(() => expect(result.current.state.phase).toBe('done'));

    expect(wakeLock.sentinels[0]?.released).toBe(true);
    const afterRun = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(afterRun);
    expect(afterRun.defaultPrevented).toBe(false);
  });
});
