import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type * as HttpModule from '../api/http';
import { ApiError } from '../api/http';
import {
  mockApiByPath,
  mockedApiFetch,
  resetApiFetchBetweenTests,
} from '../test-support/apiFetchMock';
import { useLessonPrefsStats } from './useLessonPrefsStats';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();

const STATS_PATH = '/notifications/lesson-prefs-stats';

describe('useLessonPrefsStats', () => {
  it('грузит три числа одним запросом', async () => {
    const stats = { activeStudents: 40, chosenClasses: 5, ownReminder: 3 };
    mockApiByPath({ [STATS_PATH]: stats });

    const { result } = renderHook(() => useLessonPrefsStats());

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.stats).toEqual(stats);
    expect(result.current.error).toBeNull();
    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
  });

  it('ApiError — текст сервера в error, чисел нет', async () => {
    mockApiByPath({ [STATS_PATH]: new ApiError('Сервис недоступен', 503, 'unknown') });

    const { result } = renderHook(() => useLessonPrefsStats());

    await waitFor(() => expect(result.current.error).toBe('Сервис недоступен'));
    expect(result.current.stats).toBeNull();
  });

  it('не ApiError — общий текст с действием: что делать дальше', async () => {
    mockApiByPath({ [STATS_PATH]: new Error('сеть') });

    const { result } = renderHook(() => useLessonPrefsStats());

    await waitFor(() =>
      expect(result.current.error).toBe(
        'Не удалось загрузить, сколько учеников выбрали своё. Обновите страницу.',
      ),
    );
  });
});
