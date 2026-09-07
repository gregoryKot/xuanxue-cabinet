import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as HttpModule from '../api/http';
import { apiFetch } from '../api/http';
import { useChannelTest } from './useChannelTest';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

const mockedApiFetch = vi.mocked(apiFetch);

afterEach(() => {
  mockedApiFetch.mockReset();
});

describe('useChannelTest', () => {
  it('успешный тест — POST /channels/:id/test, result заполнен', async () => {
    mockedApiFetch.mockResolvedValueOnce({ status: 'sent' });
    const { result } = renderHook(() => useChannelTest('ch1'));

    await act(async () => {
      await result.current.test();
    });

    expect(mockedApiFetch).toHaveBeenCalledWith(
      '/channels/ch1/test',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(result.current.result).toEqual({ status: 'sent' });
    expect(result.current.pending).toBe(false);
  });

  it('ApiError — текст сервера в error, result сброшен', async () => {
    const { ApiError } = await import('../api/http');
    mockedApiFetch.mockResolvedValueOnce({ status: 'sent' });
    const { result } = renderHook(() => useChannelTest('ch1'));
    await act(async () => {
      await result.current.test();
    });

    mockedApiFetch.mockRejectedValueOnce(
      new ApiError('Бот не в группе.', 502, 'unknown'),
    );
    await act(async () => {
      await result.current.test();
    });

    expect(result.current.error).toBe('Бот не в группе.');
    expect(result.current.result).toBeNull();
  });

  it('не-ApiError сбой — общий текст', async () => {
    mockedApiFetch.mockRejectedValueOnce(new Error('boom'));
    const { result } = renderHook(() => useChannelTest('ch1'));

    await act(async () => {
      await result.current.test();
    });

    await waitFor(() =>
      expect(result.current.error).toBe(
        'Не удалось проверить канал. Попробуйте ещё раз.',
      ),
    );
  });

  it('смена updatedAt (правка канала) сбрасывает старый результат теста (ревью п.16)', async () => {
    mockedApiFetch.mockResolvedValueOnce({ status: 'sent' });
    const { result, rerender } = renderHook(
      ({ updatedAt }: { updatedAt: string }) => useChannelTest('ch1', updatedAt),
      { initialProps: { updatedAt: '2026-01-01T00:00:00Z' } },
    );

    await act(async () => {
      await result.current.test();
    });
    expect(result.current.result).toEqual({ status: 'sent' });

    rerender({ updatedAt: '2026-01-02T00:00:00Z' });

    expect(result.current.result).toBeNull();
  });
});
