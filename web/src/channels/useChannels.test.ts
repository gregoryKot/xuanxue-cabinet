import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as HttpModule from '../api/http';
import { apiFetch } from '../api/http';
import { useChannels } from './useChannels';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

const mockedApiFetch = vi.mocked(apiFetch);

afterEach(() => {
  mockedApiFetch.mockReset();
});

async function renderReady() {
  mockedApiFetch.mockResolvedValueOnce([]);
  const { result } = renderHook(() => useChannels());
  await waitFor(() => expect(result.current.loading).toBe(false));
  return result;
}

describe('useChannels — загрузка', () => {
  it('запрашивает /channels с лимитом', async () => {
    const result = await renderReady();

    expect(mockedApiFetch).toHaveBeenCalledWith(
      expect.stringMatching(/^\/channels\?limit=200$/),
      expect.anything(),
    );
    expect(result.current.channels).toEqual([]);
  });

  it('activeOnly — запрашивает только активные каналы (ревью п.1)', async () => {
    mockedApiFetch.mockResolvedValueOnce([]);
    const { result } = renderHook(() => useChannels(true));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mockedApiFetch).toHaveBeenCalledWith(
      expect.stringMatching(/^\/channels\?active=true&limit=200$/),
      expect.anything(),
    );
  });
});
