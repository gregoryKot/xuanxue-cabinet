import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as HttpModule from '../api/http';
import { apiFetch } from '../api/http';
import { usePeople } from './usePeople';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

const mockedApiFetch = vi.mocked(apiFetch);

afterEach(() => {
  mockedApiFetch.mockReset();
});

describe('usePeople — загрузка', () => {
  it('запрашивает /users с лимитом', async () => {
    mockedApiFetch.mockResolvedValueOnce([]);
    const { result } = renderHook(() => usePeople());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(mockedApiFetch).toHaveBeenCalledWith(
      expect.stringMatching(/^\/users\?limit=200$/),
      expect.anything(),
    );
    expect(result.current.people).toEqual([]);
  });
});

describe('usePeople — updateRoles (read-after-write)', () => {
  it('PATCH /users/:id, затем перечитывает список', async () => {
    mockedApiFetch.mockResolvedValueOnce([]);
    const { result } = renderHook(() => usePeople());
    await waitFor(() => expect(result.current.loading).toBe(false));

    mockedApiFetch.mockResolvedValueOnce({});
    mockedApiFetch.mockResolvedValueOnce([]);
    await result.current.updateRoles('u1', { roles: ['teacher'] });

    expect(mockedApiFetch).toHaveBeenCalledWith(
      '/users/u1',
      expect.objectContaining({ method: 'PATCH', body: { roles: ['teacher'] } }),
    );
  });
});

describe('usePeople — approve (read-after-write)', () => {
  it('POST /users/:id/approve, затем перечитывает список', async () => {
    mockedApiFetch.mockResolvedValueOnce([]);
    const { result } = renderHook(() => usePeople());
    await waitFor(() => expect(result.current.loading).toBe(false));

    mockedApiFetch.mockResolvedValueOnce({});
    mockedApiFetch.mockResolvedValueOnce([]);
    await result.current.approve('u1');

    expect(mockedApiFetch).toHaveBeenCalledWith(
      '/users/u1/approve',
      expect.objectContaining({ method: 'POST' }),
    );
    // Перечитывание — второй вызов apiFetch, тот же /users?limit, что при загрузке.
    expect(mockedApiFetch).toHaveBeenCalledTimes(3);
  });
});

describe('usePeople — remove (read-after-write)', () => {
  it('DELETE /users/:id, затем перечитывает список', async () => {
    mockedApiFetch.mockResolvedValueOnce([]);
    const { result } = renderHook(() => usePeople());
    await waitFor(() => expect(result.current.loading).toBe(false));

    mockedApiFetch.mockResolvedValueOnce(undefined);
    mockedApiFetch.mockResolvedValueOnce([]);
    await result.current.remove('u1');

    expect(mockedApiFetch).toHaveBeenCalledWith(
      '/users/u1',
      expect.objectContaining({ method: 'DELETE' }),
    );
    // Перечитывание — второй вызов apiFetch, тот же /users?limit, что при загрузке.
    expect(mockedApiFetch).toHaveBeenCalledTimes(3);
  });
});
