// Даты занятий с тегом идут без окна `from`/`to` — только `tag`, выдача по
// тегу не ограничена горизонтом планирования (ADR-0078). Тег со слэшем
// кодируется и не режет путь на сегменты.
import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type * as HttpModule from '../api/http';
import {
  mockApiByPath,
  mockedApiFetch,
  resetApiFetchBetweenTests,
} from '../test-support/apiFetchMock';
import { useLessonsByTag } from './useLessonsByTag';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();

describe('useLessonsByTag', () => {
  it('спрашивает только тег, без окна', async () => {
    mockApiByPath({ '/lessons': [] });

    const { result } = renderHook(() => useLessonsByTag('дракон'));

    await waitFor(() => expect(result.current.lessons).toEqual([]));
    expect(mockedApiFetch).toHaveBeenCalledWith(
      `/lessons?tag=${encodeURIComponent('дракон')}`,
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('тег со слэшем — кодируется целиком', async () => {
    mockApiByPath({ '/lessons': [] });

    const { result } = renderHook(() => useLessonsByTag('ушу/тайцзи'));

    await waitFor(() => expect(result.current.lessons).toEqual([]));
    const [path] = mockedApiFetch.mock.calls[0] ?? [];
    expect(path).toBe(`/lessons?tag=${encodeURIComponent('ушу/тайцзи')}`);
    expect(path).not.toContain('ушу/тайцзи');
  });
});
