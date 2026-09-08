import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as HttpModule from '../api/http';
import { apiFetch, ApiError } from '../api/http';
import { useTeachers } from './useTeachers';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

const mockedApiFetch = vi.mocked(apiFetch);

afterEach(() => {
  mockedApiFetch.mockReset();
});

describe('useTeachers — загрузка', () => {
  it('запрашивает /users/teachers, отдаёт список', async () => {
    const teachers = [{ id: 't1', name: 'Дмитрий' }];
    mockedApiFetch.mockResolvedValueOnce(teachers);

    const { result } = renderHook(() => useTeachers());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mockedApiFetch).toHaveBeenCalledWith('/users/teachers', expect.anything());
    expect(result.current.teachers).toEqual(teachers);
    expect(result.current.error).toBeNull();
  });

  it('сбой — текст ошибки, список пуст (форма не падает, LeaderField просто без опций)', async () => {
    mockedApiFetch.mockRejectedValueOnce(
      new ApiError('Сервис недоступен', 503, 'unknown'),
    );

    const { result } = renderHook(() => useTeachers());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe('Сервис недоступен');
    expect(result.current.teachers).toBeNull();
  });
});
