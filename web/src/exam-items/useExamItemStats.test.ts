import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type * as HttpModule from '../api/http';
import { ApiError } from '../api/http';
import { mockedApiFetch, resetApiFetchBetweenTests } from '../test-support/apiFetchMock';
import { useExamItemStats } from './useExamItemStats';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();

describe('useExamItemStats', () => {
  it('запрашивает статистику по id вопроса', async () => {
    mockedApiFetch.mockResolvedValueOnce({ itemId: 'i1', kind: 'text', askedCount: 0 });

    const { result } = renderHook(() => useExamItemStats('i1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mockedApiFetch).toHaveBeenCalledWith(
      '/exam-items/i1/stats',
      expect.anything(),
    );
    expect(result.current.stats?.itemId).toBe('i1');
  });

  it('ApiError — текст сервера в error', async () => {
    mockedApiFetch.mockRejectedValueOnce(
      new ApiError('Сервис недоступен', 503, 'unknown'),
    );

    const { result } = renderHook(() => useExamItemStats('i1'));

    await waitFor(() => expect(result.current.error).toBe('Сервис недоступен'));
  });
});
