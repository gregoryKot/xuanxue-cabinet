import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as HttpModule from '../api/http';
import { apiFetch } from '../api/http';
import { useBroadcastDeliveries } from './useBroadcastDeliveries';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

const mockedApiFetch = vi.mocked(apiFetch);

afterEach(() => {
  mockedApiFetch.mockReset();
});

describe('useBroadcastDeliveries', () => {
  it('запрашивает /broadcasts/:id/deliveries', async () => {
    mockedApiFetch.mockResolvedValueOnce([]);
    const { result } = renderHook(() => useBroadcastDeliveries('b1'));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mockedApiFetch).toHaveBeenCalledWith(
      '/broadcasts/b1/deliveries',
      expect.anything(),
    );
    expect(result.current.deliveries).toEqual([]);
  });

  it('ApiError — текст сервера в error', async () => {
    const { ApiError } = await import('../api/http');
    mockedApiFetch.mockRejectedValueOnce(
      new ApiError('Рассылка не найдена.', 404, 'not_found'),
    );
    const { result } = renderHook(() => useBroadcastDeliveries('b1'));

    await waitFor(() => expect(result.current.error).toBe('Рассылка не найдена.'));
  });
});
