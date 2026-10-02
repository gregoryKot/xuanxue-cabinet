// Кадр-превью в загрузке через хук (ADR-0165): то, что грузится (а не исходный
// файл), уходит на снимок, а готовый кадр — в `complete`. Сам снимок —
// captureVideoPoster.test.ts, здесь он подменён целиком, чтобы тест не ждал
// ни браузера, ни срока.
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ANSWER_VIDEO_LIMITS, ANSWER_VIDEO_TOO_LARGE_MESSAGE } from '@xuanxue/shared';
import { makeFakeTransport } from '../test-support/fakeVideoTransport';
import { captureVideoPoster } from './captureVideoPoster';
import { useVideoUpload } from './useVideoUpload';

vi.mock('./captureVideoPoster', () => ({ captureVideoPoster: vi.fn() }));
const mockedCapture = vi.mocked(captureVideoPoster);

beforeEach(() => {
  mockedCapture.mockReset();
});

function renderUpload(transport = makeFakeTransport()) {
  const rendered = renderHook(() =>
    useVideoUpload({
      createTransport: () => transport,
      onDone: vi.fn(),
      maxBytes: ANSWER_VIDEO_LIMITS.maxBytes,
      tooLargeMessage: ANSWER_VIDEO_TOO_LARGE_MESSAGE,
      sleep: () => new Promise(() => {}),
    }),
  );
  return { ...rendered, transport };
}

const FILE = new File([new Uint8Array(20)], 'clip.mp4', { type: 'video/mp4' });

describe('useVideoUpload — кадр-превью', () => {
  it('снимается с того, что грузится, и уходит в complete', async () => {
    mockedCapture.mockResolvedValue('QkFTRTY0');
    const { result, transport } = renderUpload();

    act(() => result.current.selectFile(FILE));

    await waitFor(() => expect(result.current.state.phase).toBe('done'));
    expect(mockedCapture.mock.calls[0]?.[0]).toBe(FILE);
    expect(transport.complete.mock.calls[0]?.[1]).toBe('QkFTRTY0');
  });

  it('снять не вышло — видео всё равно готово, complete без кадра', async () => {
    mockedCapture.mockResolvedValue(null);
    const { result, transport } = renderUpload();

    act(() => result.current.selectFile(FILE));

    await waitFor(() => expect(result.current.state.phase).toBe('done'));
    expect(transport.complete.mock.calls[0]?.[1]).toBeUndefined();
  });

  it('«Отменить» отдаёт снимку отменённый сигнал', async () => {
    mockedCapture.mockReturnValue(new Promise(() => {}));
    const { result, transport } = renderUpload(
      makeFakeTransport({ start: () => new Promise(() => {}) }),
    );
    act(() => result.current.selectFile(FILE));
    await waitFor(() => expect(transport.start).toHaveBeenCalled());

    act(() => result.current.cancel());

    expect(mockedCapture.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  });
});
