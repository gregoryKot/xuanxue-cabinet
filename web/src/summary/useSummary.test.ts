import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SummaryDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { apiFetch } from '../api/http';
import { useSummary } from './useSummary';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

const mockedApiFetch = vi.mocked(apiFetch);

const SUMMARY: SummaryDto = {
  period: { from: '2026-08-08T00:00:00Z', to: '2026-09-07T00:00:00Z' },
  broadcastsSent: 12,
  deliveriesFailed: 1,
  deliveriesPending: 2,
  manualWaiting: 3,
};

afterEach(() => {
  mockedApiFetch.mockReset();
});

describe('useSummary', () => {
  it('загружает /summary и отдаёт данные', async () => {
    mockedApiFetch.mockResolvedValueOnce(SUMMARY);
    const { result } = renderHook(() => useSummary());

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.summary).toEqual(SUMMARY);
    expect(mockedApiFetch).toHaveBeenCalledWith('/summary', expect.anything());
  });

  it('сбой сети — текст ошибки, reload() повторяет запрос', async () => {
    const { ApiError } = await import('../api/http');
    mockedApiFetch.mockRejectedValueOnce(
      new ApiError('Сервис недоступен', 503, 'unknown'),
    );
    const { result } = renderHook(() => useSummary());

    await waitFor(() => expect(result.current.error).toBe('Сервис недоступен'));

    mockedApiFetch.mockResolvedValueOnce(SUMMARY);
    await result.current.reload();

    await waitFor(() => expect(result.current.summary).toEqual(SUMMARY));
    expect(result.current.error).toBeNull();
  });

  it('не-ApiError сбой — общий текст ошибки', async () => {
    mockedApiFetch.mockRejectedValueOnce(new Error('boom'));
    const { result } = renderHook(() => useSummary());

    await waitFor(() =>
      expect(result.current.error).toBe(
        'Не удалось загрузить сводку. Попробуйте ещё раз.',
      ),
    );
  });

  // Гонка запросов (устаревший ответ не перезаписывает новый) — тест общей
  // логики лежит в hooks/useAbortableFetch.test.ts, здесь её незачем повторять.
});
