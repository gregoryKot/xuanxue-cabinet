import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type * as HttpModule from '../api/http';
import { ApiError } from '../api/http';
import { mockedApiFetch, resetApiFetchBetweenTests } from '../test-support/apiFetchMock';
import { useExamImageStats } from './useExamImageStats';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();

describe('useExamImageStats', () => {
  it('запрашивает /exam-images/stats-summary', async () => {
    mockedApiFetch.mockResolvedValueOnce({ count: 3, totalBytes: 900_000 });

    const { result } = renderHook(() => useExamImageStats());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mockedApiFetch).toHaveBeenCalledWith(
      '/exam-images/stats-summary',
      expect.anything(),
    );
    expect(result.current.stats).toEqual({ count: 3, totalBytes: 900_000 });
  });

  it('ApiError — текст сервера в error, stats остаётся null', async () => {
    mockedApiFetch.mockRejectedValueOnce(
      new ApiError('Сервис недоступен', 503, 'unknown'),
    );

    const { result } = renderHook(() => useExamImageStats());

    await waitFor(() => expect(result.current.error).toBe('Сервис недоступен'));
    expect(result.current.stats).toBeNull();
  });
});
