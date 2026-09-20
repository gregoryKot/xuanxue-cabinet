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

  // Пара к тесту выше: явный reload() человека выключенный хук будит, а
  // фоновый тик — нет (ADR-0076). Иначе `useMyExams({ enabled: !isTeacher })`
  // у счётчика уведомлений сходил бы за экзаменами штата раз в минуту —
  // ровно то хождение, которое убрал ADR-0074.
  it('refresh() на выключенном хуке молчит — фоновый тик его не будит', async () => {
    const load = vi.fn().mockResolvedValue('готово');
    const { result } = renderHook(() =>
      useAbortableFetch(load, FALLBACK, { enabled: false }),
    );

    await act(async () => {
      await result.current.refresh();
    });

    expect(load).not.toHaveBeenCalled();
    expect(result.current.data).toBeNull();
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

describe('useAbortableFetch — refresh() тихое перечитывание (ADR-0076)', () => {
  it('не поднимает loading, пока идёт тихий запрос', async () => {
    let resolveRefresh: ((value: string) => void) | undefined;
    const load = vi
      .fn()
      .mockResolvedValueOnce('первое')
      .mockImplementationOnce(
        () =>
          new Promise<string>((resolve) => {
            resolveRefresh = resolve;
          }),
      );
    const { result } = renderHook(() => useAbortableFetch(load, FALLBACK));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let refreshPromise: Promise<void> | undefined;
    act(() => {
      refreshPromise = result.current.refresh();
    });
    // Синхронная часть refresh() уже отработала (до await load()) — если бы
    // тихий режим поднимал loading, act() выше успел бы это отрисовать.
    expect(result.current.loading).toBe(false);

    await act(async () => {
      resolveRefresh?.('обновлено');
      await refreshPromise;
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.data).toBe('обновлено');
  });

  it('сбой refresh() не пишет в состояние — данные и error остаются прежними', async () => {
    const load = vi.fn().mockResolvedValueOnce('данные');
    const { result } = renderHook(() => useAbortableFetch(load, FALLBACK));
    await waitFor(() => expect(result.current.data).toBe('данные'));

    load.mockRejectedValueOnce(new ApiError('Сервис недоступен', 503, 'unknown'));
    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.data).toBe('данные');
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('успешный refresh() гасит прежнюю ошибку', async () => {
    const load = vi
      .fn()
      .mockRejectedValueOnce(new ApiError('Сервис недоступен', 503, 'unknown'))
      .mockResolvedValueOnce('починили');
    const { result } = renderHook(() => useAbortableFetch(load, FALLBACK));
    await waitFor(() => expect(result.current.error).toBe('Сервис недоступен'));

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.error).toBeNull();
    expect(result.current.data).toBe('починили');
    expect(result.current.loading).toBe(false);
  });

  it('тик опроса пропускается, пока живой reload() в полёте — reload() доигрывает как обычно', async () => {
    let resolveReload: ((value: string) => void) | undefined;
    const load = vi
      .fn()
      .mockResolvedValueOnce('первое')
      .mockImplementationOnce(
        () =>
          new Promise<string>((resolve) => {
            resolveReload = resolve;
          }),
      );
    const { result } = renderHook(() => useAbortableFetch(load, FALLBACK));
    await waitFor(() => expect(result.current.loading).toBe(false));

    let reloadPromise: Promise<void> | undefined;
    act(() => {
      reloadPromise = result.current.reload();
    });
    expect(result.current.loading).toBe(true);
    expect(load).toHaveBeenCalledTimes(2);

    // Тик опроса во время живого reload() — молча выходит, не зовёт load() снова.
    await act(async () => {
      await result.current.refresh();
    });
    expect(load).toHaveBeenCalledTimes(2);
    expect(result.current.loading).toBe(true);

    await act(async () => {
      resolveReload?.('живой');
      await reloadPromise;
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.data).toBe('живой');
  });
});
