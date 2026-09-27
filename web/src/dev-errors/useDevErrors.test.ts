import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AppErrorListDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { apiFetch } from '../api/http';
import { useDevErrors } from './useDevErrors';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

const mockedApiFetch = vi.mocked(apiFetch);

afterEach(() => {
  mockedApiFetch.mockReset();
});

const EMPTY: AppErrorListDto = { items: [], last24h: 0 };

describe('useDevErrors — загрузка', () => {
  it('монтирование без кода — один запрос без requestId в пути', async () => {
    mockedApiFetch.mockResolvedValue(EMPTY);

    const { result } = renderHook(() => useDevErrors(''));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual(EMPTY);
    expect(result.current.error).toBeNull();
    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
    expect(mockedApiFetch).toHaveBeenCalledWith('/dev/errors', expect.anything());
  });

  it('код обращения — путь с requestId в query', async () => {
    mockedApiFetch.mockResolvedValue(EMPTY);

    renderHook(() => useDevErrors('req-1'));

    await waitFor(() =>
      expect(mockedApiFetch).toHaveBeenCalledWith(
        '/dev/errors?requestId=req-1',
        expect.anything(),
      ),
    );
  });

  it('смена кода после монтирования — перечитывает список', async () => {
    mockedApiFetch.mockResolvedValue(EMPTY);

    const { rerender } = renderHook(({ requestId }) => useDevErrors(requestId), {
      initialProps: { requestId: '' },
    });

    await waitFor(() => expect(mockedApiFetch).toHaveBeenCalledTimes(1));

    rerender({ requestId: 'req-2' });

    await waitFor(() => expect(mockedApiFetch).toHaveBeenCalledTimes(2));
    expect(mockedApiFetch).toHaveBeenLastCalledWith(
      '/dev/errors?requestId=req-2',
      expect.anything(),
    );
  });

  it('сбой загрузки — error заполнен текстом по умолчанию', async () => {
    mockedApiFetch.mockRejectedValue(new Error('boom'));

    const { result } = renderHook(() => useDevErrors(''));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe(
      'Не удалось загрузить журнал сбоев. Попробуйте ещё раз.',
    );
  });
});
