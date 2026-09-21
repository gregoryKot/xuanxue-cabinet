import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as HttpModule from '../api/http';
import { apiFetch } from '../api/http';
import { usePreview } from './usePreview';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

const mockedApiFetch = vi.mocked(apiFetch);

afterEach(() => {
  mockedApiFetch.mockReset();
});

describe('usePreview', () => {
  it('успех — POST /settings/preview с телом, result заполнен', async () => {
    mockedApiFetch.mockResolvedValueOnce({ text: 'Через 30 минут занятие' });
    const { result } = renderHook(() => usePreview());

    await act(async () => {
      await result.current.preview('lesson_link', 'l1');
    });

    // objectContaining — вызов несёт ещё и signal (AbortController ниже),
    // сверять его отдельным значением незачем.
    expect(mockedApiFetch).toHaveBeenCalledWith(
      '/settings/preview',
      expect.objectContaining({
        method: 'POST',
        body: { kind: 'lesson_link', lessonId: 'l1' },
      }),
    );
    expect(result.current.result).toEqual({ text: 'Через 30 минут занятие' });
  });

  it('recordingIsStandIn — передаётся как есть', async () => {
    mockedApiFetch.mockResolvedValueOnce({
      text: 'Тема занятия',
      recordingIsStandIn: true,
    });
    const { result } = renderHook(() => usePreview());

    await act(async () => {
      await result.current.preview('recording', 'l1');
    });

    expect(result.current.result?.recordingIsStandIn).toBe(true);
  });

  it('ApiError — текст сервера в error, result сброшен', async () => {
    const { ApiError } = await import('../api/http');
    mockedApiFetch.mockResolvedValueOnce({ text: 'ok' });
    const { result } = renderHook(() => usePreview());
    await act(async () => {
      await result.current.preview('lesson_link', 'l1');
    });

    mockedApiFetch.mockRejectedValueOnce(
      new ApiError('Занятие не найдено.', 404, 'not_found'),
    );
    await act(async () => {
      await result.current.preview('lesson_link', 'l2');
    });

    expect(result.current.error).toBe('Занятие не найдено.');
    expect(result.current.result).toBeNull();
  });

  it('не-ApiError сбой — общий текст', async () => {
    mockedApiFetch.mockRejectedValueOnce(new Error('boom'));
    const { result } = renderHook(() => usePreview());

    await act(async () => {
      await result.current.preview('lesson_link', 'l1');
    });

    expect(result.current.error).toBe(
      'Не удалось показать предпросмотр. Попробуйте ещё раз.',
    );
  });

  // Аудит 2026-09-21 (MED): быстрое переключение занятия в select слало два
  // POST в полёте, и более поздний ответ на СТАРОЕ занятие переписывал уже
  // показанный результат нового — сюда как раз тот порядок ответов.
  it('гонка — второй вызов обгоняет первый, поздний ответ на первый не побеждает', async () => {
    const { result } = renderHook(() => usePreview());

    let resolveFirst: (value: { text: string }) => void = () => {};
    mockedApiFetch.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFirst = resolve;
      }),
    );
    mockedApiFetch.mockResolvedValueOnce({ text: 'Занятие 2' });

    let firstPreview!: Promise<void>;
    act(() => {
      firstPreview = result.current.preview('lesson_link', 'l1');
    });
    await act(async () => {
      await result.current.preview('lesson_link', 'l2');
    });

    // Второй вызов реально отменил первый (signal), не только по requestId —
    // требование аудита: «предыдущий запрос отменяется через signal в apiFetch».
    const firstInit = mockedApiFetch.mock.calls[0]?.[1] as { signal?: AbortSignal };
    expect(firstInit.signal?.aborted).toBe(true);
    expect(result.current.result).toEqual({ text: 'Занятие 2' });

    // Первый резолвится последним — его ответ устарел и не должен победить.
    await act(async () => {
      resolveFirst({ text: 'Занятие 1' });
      await firstPreview;
    });
    expect(result.current.result).toEqual({ text: 'Занятие 2' });
  });

  // Пара к тесту выше: устаревший запрос падает с ошибкой (не резолвится),
  // а не только опаздывает с успехом — сверка id в catch (не только в success)
  // не даёт его ошибке затереть уже показанный результат второго вызова.
  it('гонка — устаревший запрос упал с ошибкой, результат и pending второго не тронуты', async () => {
    const { result } = renderHook(() => usePreview());

    let rejectFirst: (err: unknown) => void = () => {};
    mockedApiFetch.mockReturnValueOnce(
      new Promise((_resolve, reject) => {
        rejectFirst = reject;
      }),
    );
    mockedApiFetch.mockResolvedValueOnce({ text: 'Занятие 2' });

    let firstPreview!: Promise<void>;
    act(() => {
      firstPreview = result.current.preview('lesson_link', 'l1');
    });
    await act(async () => {
      await result.current.preview('lesson_link', 'l2');
    });
    expect(result.current.result).toEqual({ text: 'Занятие 2' });
    expect(result.current.pending).toBe(false);

    await act(async () => {
      rejectFirst(new Error('boom'));
      await firstPreview;
    });
    expect(result.current.result).toEqual({ text: 'Занятие 2' });
    expect(result.current.error).toBeNull();
    expect(result.current.pending).toBe(false);
  });
});
