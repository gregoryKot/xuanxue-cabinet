import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { GradingCommentPresetDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { ApiError } from '../api/http';
import { mockedApiFetch, resetApiFetchBetweenTests } from '../test-support/apiFetchMock';
import { useGradingPresets } from './useGradingPresets';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();

function makePreset(
  overrides: Partial<GradingCommentPresetDto> = {},
): GradingCommentPresetDto {
  return {
    id: 'p1',
    text: 'Держите центр тяжести',
    createdBy: 't1',
    createdAt: '2026-09-01T00:00:00Z',
    ...overrides,
  };
}

describe('useGradingPresets — загрузка', () => {
  it('запрашивает /grading-presets с лимитом 200', async () => {
    mockedApiFetch.mockResolvedValueOnce([]);
    const { result } = renderHook(() => useGradingPresets());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mockedApiFetch).toHaveBeenCalledWith(
      '/grading-presets?limit=200',
      expect.anything(),
    );
  });

  it('успешная загрузка — presets заполнен, loading снят', async () => {
    mockedApiFetch.mockResolvedValueOnce([makePreset()]);
    const { result } = renderHook(() => useGradingPresets());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.presets).toHaveLength(1);
    expect(result.current.error).toBeNull();
  });

  it('ApiError — текст сервера в error', async () => {
    mockedApiFetch.mockRejectedValueOnce(
      new ApiError('Сервис недоступен', 503, 'unknown'),
    );
    const { result } = renderHook(() => useGradingPresets());

    await waitFor(() => expect(result.current.error).toBe('Сервис недоступен'));
  });
});

describe('useGradingPresets — create (read-after-write)', () => {
  it('POST /grading-presets, затем перечитывает список', async () => {
    mockedApiFetch.mockResolvedValueOnce([]);
    const { result } = renderHook(() => useGradingPresets());
    await waitFor(() => expect(result.current.loading).toBe(false));

    mockedApiFetch.mockResolvedValueOnce(makePreset());
    mockedApiFetch.mockResolvedValueOnce([makePreset()]);
    await result.current.create('Держите центр тяжести');

    expect(mockedApiFetch).toHaveBeenCalledWith(
      '/grading-presets',
      expect.objectContaining({
        method: 'POST',
        body: { text: 'Держите центр тяжести' },
      }),
    );
    expect(mockedApiFetch).toHaveBeenCalledWith(
      '/grading-presets?limit=200',
      expect.anything(),
    );
  });
});

describe('useGradingPresets — remove (read-after-write)', () => {
  it('DELETE /grading-presets/:id, затем перечитывает список', async () => {
    mockedApiFetch.mockResolvedValueOnce([makePreset()]);
    const { result } = renderHook(() => useGradingPresets());
    await waitFor(() => expect(result.current.loading).toBe(false));

    mockedApiFetch.mockResolvedValueOnce(undefined);
    mockedApiFetch.mockResolvedValueOnce([]);
    await result.current.remove('p1');

    expect(mockedApiFetch).toHaveBeenCalledWith(
      '/grading-presets/p1',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });
});
