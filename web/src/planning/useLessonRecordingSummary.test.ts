import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type * as HttpModule from '../api/http';
import { ApiError } from '../api/http';
import { mockedApiFetch, resetApiFetchBetweenTests } from '../test-support/apiFetchMock';
import { useLessonRecordingSummary } from './useLessonRecordingSummary';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();

describe('useLessonRecordingSummary', () => {
  it('запрашивает /lessons/recording-summary и отдаёт число', async () => {
    mockedApiFetch.mockResolvedValueOnce({
      periodDays: 30,
      lessonsPast: 4,
      lessonsWithRecording: 2,
    });

    const { result } = renderHook(() => useLessonRecordingSummary());
    await waitFor(() =>
      expect(result.current).toEqual({
        periodDays: 30,
        lessonsPast: 4,
        lessonsWithRecording: 2,
      }),
    );

    expect(mockedApiFetch).toHaveBeenCalledWith(
      '/lessons/recording-summary',
      expect.anything(),
    );
  });

  // Сбой загрузки числа не должен ломать экран (useLessonRecordingSummary.ts):
  // хук молчит про ошибку, PlanningScreen.tsx просто не показывает строку.
  it('сбой загрузки — остаётся null, без выброшенной ошибки', async () => {
    mockedApiFetch.mockRejectedValueOnce(new ApiError('Сбой', 503, 'unknown'));

    const { result } = renderHook(() => useLessonRecordingSummary());

    await waitFor(() => expect(mockedApiFetch).toHaveBeenCalled());
    expect(result.current).toBeNull();
  });
});
