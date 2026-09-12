// По образцу people/useTeachers.test.ts — тонкая обёртка над
// useAbortableFetch, тест на путь запроса и проброс ошибки.
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as HttpModule from '../api/http';
import { apiFetch, ApiError } from '../api/http';
import { useMyLessons } from './useMyLessons';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

const mockedApiFetch = vi.mocked(apiFetch);

afterEach(() => {
  mockedApiFetch.mockReset();
});

describe('useMyLessons — загрузка', () => {
  it('запрашивает /me/lessons без своего лимита, отдаёт список', async () => {
    const lessons = [{ id: 'l1' }];
    mockedApiFetch.mockResolvedValueOnce(lessons);

    const { result } = renderHook(() => useMyLessons());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mockedApiFetch).toHaveBeenCalledWith('/me/lessons', expect.anything());
    expect(result.current.data).toEqual(lessons);
    expect(result.current.error).toBeNull();
  });

  it('сбой сети — текст ошибки, данных нет', async () => {
    mockedApiFetch.mockRejectedValueOnce(
      new ApiError('Сервис недоступен', 503, 'unknown'),
    );

    const { result } = renderHook(() => useMyLessons());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe('Сервис недоступен');
    expect(result.current.data).toBeNull();
  });
});
