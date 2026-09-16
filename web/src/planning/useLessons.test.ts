import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as HttpModule from '../api/http';
import { apiFetch } from '../api/http';
import { useLessons } from './useLessons';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

const mockedApiFetch = vi.mocked(apiFetch);

afterEach(() => {
  mockedApiFetch.mockReset();
});

describe('useLessons — загрузка', () => {
  it('запрашивает /lessons с окном планирования и лимитом', async () => {
    mockedApiFetch.mockResolvedValueOnce([]);
    const { result } = renderHook(() => useLessons());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mockedApiFetch).toHaveBeenCalledWith(
      expect.stringMatching(/^\/lessons\?from=.+&to=.+&limit=200$/),
      expect.anything(),
    );
    expect(result.current.lessons).toEqual([]);
  });

  // Гонка запросов и разбор ошибки (ApiError/общий текст) — тест общей
  // логики лежит в hooks/useAbortableFetch.test.ts, здесь незачем повторять.
  // Создание, правка и запись — у страницы занятия (useLessonEditor.ts,
  // LessonEditorScreen.test.tsx), сюда они больше не приходят (ADR-0033).
});
