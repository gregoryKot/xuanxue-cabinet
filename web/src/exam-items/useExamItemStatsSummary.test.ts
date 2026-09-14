import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type * as HttpModule from '../api/http';
import { ApiError } from '../api/http';
import { mockedApiFetch, resetApiFetchBetweenTests } from '../test-support/apiFetchMock';
import { useExamItemStatsSummary } from './useExamItemStatsSummary';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();

describe('useExamItemStatsSummary', () => {
  it('запрашивает /exam-items/stats-summary', async () => {
    mockedApiFetch.mockResolvedValueOnce({ strugglingCount: 0 });

    const { result } = renderHook(() => useExamItemStatsSummary());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mockedApiFetch).toHaveBeenCalledWith(
      '/exam-items/stats-summary',
      expect.anything(),
    );
    expect(result.current.summary).toEqual({ strugglingCount: 0 });
  });

  it('ApiError — текст сервера в error, summary остаётся null', async () => {
    mockedApiFetch.mockRejectedValueOnce(
      new ApiError('Сервис недоступен', 503, 'unknown'),
    );

    const { result } = renderHook(() => useExamItemStatsSummary());

    await waitFor(() => expect(result.current.error).toBe('Сервис недоступен'));
    expect(result.current.summary).toBeNull();
  });
});
