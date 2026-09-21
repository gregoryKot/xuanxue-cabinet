// По образцу grading/useGradingQueue.test.ts и people/usePeople.test.ts
// (ветка enabled: false).
import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type * as HttpModule from '../api/http';
import { ApiError } from '../api/http';
import { mockedApiFetch, resetApiFetchBetweenTests } from '../test-support/apiFetchMock';
import { useExamAttemptCount } from './useExamAttemptCount';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();

describe('useExamAttemptCount — загрузка', () => {
  it('запрашивает /exams/:examId/attempt-count, total заполнен', async () => {
    mockedApiFetch.mockResolvedValueOnce({ total: 3 });
    const { result } = renderHook(() => useExamAttemptCount('e1'));

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mockedApiFetch).toHaveBeenCalledWith(
      '/exams/e1/attempt-count',
      expect.anything(),
    );
    expect(result.current.total).toBe(3);
    expect(result.current.error).toBeNull();
  });

  it('ApiError — текст сервера в error, total остаётся null', async () => {
    mockedApiFetch.mockRejectedValueOnce(
      new ApiError('Сервис недоступен', 503, 'unknown'),
    );
    const { result } = renderHook(() => useExamAttemptCount('e1'));

    await waitFor(() => expect(result.current.error).toBe('Сервис недоступен'));
    expect(result.current.total).toBeNull();
  });
});

describe('useExamAttemptCount — examId не задан (новый экзамен)', () => {
  it('не зовёт GET, total остаётся null, loading false', () => {
    const { result } = renderHook(() => useExamAttemptCount(undefined));

    expect(result.current.loading).toBe(false);
    expect(result.current.total).toBeNull();
    expect(mockedApiFetch).not.toHaveBeenCalled();
  });
});
