import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type * as HttpModule from '../api/http';
import { ApiError } from '../api/http';
import { mockApiByPath, resetApiFetchBetweenTests } from '../test-support/apiFetchMock';
import { useAnswerVideoStats } from './useAnswerVideoStats';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();

describe('useAnswerVideoStats', () => {
  it('запрашивает /answer-videos/stats-summary', async () => {
    mockApiByPath({
      '/answer-videos/stats-summary': { count: 2, totalBytes: 90_000_000 },
    });

    const { result } = renderHook(() => useAnswerVideoStats());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.stats).toEqual({ count: 2, totalBytes: 90_000_000 });
  });

  it('ApiError — текст сервера в error, stats остаётся null', async () => {
    mockApiByPath({
      '/answer-videos/stats-summary': new ApiError('Сервис недоступен', 503, 'unknown'),
    });

    const { result } = renderHook(() => useAnswerVideoStats());

    await waitFor(() => expect(result.current.error).toBe('Сервис недоступен'));
    expect(result.current.stats).toBeNull();
  });
});
