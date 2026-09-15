import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/http';
import { useAbortableFetch } from './useAbortableFetch';

const FALLBACK = 'Не удалось загрузить. Попробуйте ещё раз.';

describe('useAbortableFetch — загрузка', () => {
  it('успешная загрузка — data заполнен, loading снят', async () => {
    const load = vi.fn().mockResolvedValue('готово');
    const { result } = renderHook(() => useAbortableFetch(load, FALLBACK));

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.data).toBe('готово');
    expect(result.current.error).toBeNull();
    expect(load).toHaveBeenCalledWith(expect.any(AbortSignal));
  });

  it('ApiError — текст сервера в error', async () => {
    const load = vi
      .fn()
      .mockRejectedValue(new ApiError('Сервис недоступен', 503, 'unknown'));
    const { result } = renderHook(() => useAbortableFetch(load, FALLBACK));

    await waitFor(() => expect(result.current.error).toBe('Сервис недоступен'));
  });

  it('не-ApiError сбой — общий текст, не сырое сообщение', async () => {
    const load = vi.fn().mockRejectedValue(new TypeError('внутренняя ошибка'));
    const { result } = renderHook(() => useAbortableFetch(load, FALLBACK));

    await waitFor(() => expect(result.current.error).toBe(FALLBACK));
  });

  it('reload() — повторяет запрос и сбрасывает предыдущую ошибку', async () => {
    const load = vi
      .fn()
      .mockRejectedValueOnce(new ApiError('Сервис недоступен', 503, 'unknown'))
      .mockResolvedValueOnce('готово');
    const { result } = renderHook(() => useAbortableFetch(load, FALLBACK));
    await waitFor(() => expect(result.current.error).toBe('Сервис недоступен'));

    await act(async () => {
      await result.current.reload();
    });

    expect(result.current.error).toBeNull();
    expect(result.current.data).toBe('готово');
  });
});

describe('useAbortableFetch — enabled: false (ADR-0030)', () => {
  it('не зовёт load(), loading сразу false, data null', () => {
    const load = vi.fn().mockResolvedValue('готово');
    const { result } = renderHook(() =>
      useAbortableFetch(load, FALLBACK, { enabled: false }),
    );

    expect(load).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(false);
    expect(result.current.data).toBeNull();
  });

  it('reload() всё равно работает по явному вызову', async () => {
    const load = vi.fn().mockResolvedValue('готово');
    const { result } = renderHook(() =>
      useAbortableFetch(load, FALLBACK, { enabled: false }),
    );

    await act(async () => {
      await result.current.reload();
    });

    expect(result.current.data).toBe('готово');
  });
});

describe('useAbortableFetch — гонка запросов (ревью п.13)', () => {
  it('устаревший успешный ответ не перезаписывает новый', async () => {
    let resolveFirst: ((value: string) => void) | undefined;
    const load = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<string>((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockResolvedValueOnce('новый');
    const { result } = renderHook(() => useAbortableFetch(load, FALLBACK));

    await act(async () => {
      await result.current.reload();
    });
    act(() => {
      resolveFirst?.('устаревший');
    });

    expect(result.current.data).toBe('новый');
  });

  it('устаревшая ошибка не перезаписывает успешный ответ', async () => {
    let rejectFirst: ((err: unknown) => void) | undefined;
    const load = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<string>((_resolve, reject) => {
            rejectFirst = reject;
          }),
      )
      .mockResolvedValueOnce('готово');
    const { result } = renderHook(() => useAbortableFetch(load, FALLBACK));

    await act(async () => {
      await result.current.reload();
    });
    act(() => {
      rejectFirst?.(new Error('устаревший сбой'));
    });

    expect(result.current.error).toBeNull();
    expect(result.current.data).toBe('готово');
  });
});
