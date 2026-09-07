import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ClassDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { ApiError, apiFetch } from '../api/http';
import { useClasses } from './useClasses';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

const mockedApiFetch = vi.mocked(apiFetch);

function makeClass(overrides: Partial<ClassDto> = {}): ClassDto {
  return {
    id: 'c1',
    title: 'Тайцзицюань',
    groupLabel: '',
    format: 'online',
    rules: [],
    tz: 'Asia/Jerusalem',
    channelIds: [],
    leadMinutes: 30,
    active: true,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

afterEach(() => {
  mockedApiFetch.mockReset();
});

describe('useClasses — загрузка', () => {
  it('успешная загрузка — classes заполнен, loading снят', async () => {
    mockedApiFetch.mockResolvedValue([makeClass()]);

    const { result } = renderHook(() => useClasses());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.classes).toHaveLength(1);
    expect(result.current.error).toBeNull();
  });

  it('ApiError — текст сервера в error, «Обновить» (reload) повторяет запрос', async () => {
    mockedApiFetch.mockRejectedValueOnce(
      new ApiError('Сервис недоступен', 503, 'unknown'),
    );
    const { result } = renderHook(() => useClasses());
    await waitFor(() => expect(result.current.error).toBe('Сервис недоступен'));

    mockedApiFetch.mockResolvedValueOnce([makeClass()]);
    await act(async () => {
      await result.current.reload();
    });

    expect(result.current.error).toBeNull();
    expect(result.current.classes).toHaveLength(1);
  });

  it('не-ApiError (например TypeError) — общий текст, не сырое сообщение', async () => {
    mockedApiFetch.mockRejectedValue(new TypeError('какая-то внутренняя ошибка'));

    const { result } = renderHook(() => useClasses());

    await waitFor(() =>
      expect(result.current.error).toBe(
        'Не удалось загрузить расписание. Попробуйте ещё раз.',
      ),
    );
  });

  it('reload() дважды подряд — учитывается только ответ последнего вызова', async () => {
    let resolveFirst: ((value: ClassDto[]) => void) | undefined;
    mockedApiFetch.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirst = resolve;
        }),
    );
    mockedApiFetch.mockResolvedValueOnce([makeClass({ id: 'second' })]);

    const { result } = renderHook(() => useClasses());
    await act(async () => {
      await result.current.reload();
    });

    // Первый (самый ранний) запрос отвечает ПОСЛЕ второго — его результат
    // не должен затереть уже применённый ответ второго вызова.
    act(() => {
      resolveFirst?.([makeClass({ id: 'stale' })]);
    });

    expect(result.current.classes?.[0]?.id).toBe('second');
  });
});

describe('useClasses — мутации', () => {
  it('create() зовёт POST, затем перечитывает список', async () => {
    mockedApiFetch.mockResolvedValue([]);
    const { result } = renderHook(() => useClasses());
    await waitFor(() => expect(result.current.loading).toBe(false));

    mockedApiFetch.mockResolvedValueOnce(makeClass());
    mockedApiFetch.mockResolvedValueOnce([makeClass()]);
    await act(async () => {
      await result.current.create({ title: 'Новое', format: 'online' });
    });

    expect(mockedApiFetch).toHaveBeenCalledWith(
      '/classes',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(result.current.classes).toHaveLength(1);
  });

  it('update() зовёт PATCH по id, затем перечитывает список', async () => {
    mockedApiFetch.mockResolvedValue([makeClass()]);
    const { result } = renderHook(() => useClasses());
    await waitFor(() => expect(result.current.loading).toBe(false));

    mockedApiFetch.mockResolvedValueOnce(makeClass());
    mockedApiFetch.mockResolvedValueOnce([makeClass()]);
    await act(async () => {
      await result.current.update('c1', { title: 'Правка' });
    });

    expect(mockedApiFetch).toHaveBeenCalledWith(
      '/classes/c1',
      expect.objectContaining({ method: 'PATCH' }),
    );
  });

  it('remove() зовёт DELETE по id, затем перечитывает список', async () => {
    mockedApiFetch.mockResolvedValue([makeClass()]);
    const { result } = renderHook(() => useClasses());
    await waitFor(() => expect(result.current.loading).toBe(false));

    mockedApiFetch.mockResolvedValueOnce(undefined);
    mockedApiFetch.mockResolvedValueOnce([]);
    await act(async () => {
      await result.current.remove('c1');
    });

    expect(mockedApiFetch).toHaveBeenCalledWith(
      '/classes/c1',
      expect.objectContaining({ method: 'DELETE' }),
    );
    expect(result.current.classes).toHaveLength(0);
  });
});
