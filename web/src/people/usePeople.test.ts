import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { UserDto } from '@xuanxue/shared';
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

// «Ученик» — не роль (ADR-0026, shared/src/auth.ts): по умолчанию без ролей.
function makeUser(overrides: Partial<UserDto> = {}): UserDto {
  return {
    id: 'u1',
    name: 'Аня',
    roles: [],
    status: 'active',
    hasTelegram: true,
    joinedViaInvite: true,
    ...overrides,
  };
}

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

describe('usePeople — enabled: false (ADR-0030, учитель на «Люди»)', () => {
  it('не зовёт GET /users, people остаётся null, loading false', () => {
    const { result } = renderHook(() => usePeople(false));

    expect(result.current.loading).toBe(false);
    expect(result.current.people).toBeNull();
    expect(mockedApiFetch).not.toHaveBeenCalled();
  });
});

describe('usePeople — updateRoles (read-after-write, ADR-0087)', () => {
  it('ровно один запрос — PATCH правит список ответом записи, второго GET нет', async () => {
    mockedApiFetch.mockResolvedValueOnce([makeUser({ roles: [] })]);
    const { result } = renderHook(() => usePeople());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const updated = makeUser({ roles: ['teacher'] });
    mockedApiFetch.mockResolvedValueOnce(updated);
    await act(async () => {
      await result.current.updateRoles('u1', { roles: ['teacher'] });
    });

    expect(mockedApiFetch).toHaveBeenCalledWith(
      '/users/u1',
      expect.objectContaining({ method: 'PATCH', body: { roles: ['teacher'] } }),
    );
    // Загрузка + запись, ни одного похода в сеть сверх этого (нет reload()).
    expect(mockedApiFetch).toHaveBeenCalledTimes(2);
    // На экране — то, что вернул PATCH, взятое без второго GET.
    expect(result.current.people).toEqual([updated]);
  });
});

describe('usePeople — updateStatus (read-after-write, ADR-0087)', () => {
  it('ровно один запрос — PATCH правит список ответом записи, второго GET нет', async () => {
    mockedApiFetch.mockResolvedValueOnce([makeUser({ status: 'active' })]);
    const { result } = renderHook(() => usePeople());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const updated = makeUser({ status: 'blocked' });
    mockedApiFetch.mockResolvedValueOnce(updated);
    await act(async () => {
      await result.current.updateStatus('u1', 'blocked');
    });

    expect(mockedApiFetch).toHaveBeenCalledWith(
      '/users/u1/status',
      expect.objectContaining({ method: 'PATCH', body: { status: 'blocked' } }),
    );
    expect(mockedApiFetch).toHaveBeenCalledTimes(2);
    expect(result.current.people).toEqual([updated]);
  });
});

describe('usePeople — remove (read-after-write, ADR-0087)', () => {
  it('ровно один запрос — DELETE, удалённый элемент выкинут из списка без второго GET', async () => {
    mockedApiFetch.mockResolvedValueOnce([
      makeUser({ id: 'u1', name: 'Аня' }),
      makeUser({ id: 'u2', name: 'Боря' }),
    ]);
    const { result } = renderHook(() => usePeople());
    await waitFor(() => expect(result.current.loading).toBe(false));

    // DELETE отвечает 204 без тела (apiFetch возвращает undefined) — тем же
    // приёмом, что и в проде, а не выдуманным телом ответа.
    mockedApiFetch.mockResolvedValueOnce(undefined);
    await act(async () => {
      await result.current.remove('u1');
    });

    expect(mockedApiFetch).toHaveBeenCalledWith(
      '/users/u1',
      expect.objectContaining({ method: 'DELETE' }),
    );
    expect(mockedApiFetch).toHaveBeenCalledTimes(2);
    expect(result.current.people).toEqual([makeUser({ id: 'u2', name: 'Боря' })]);
  });
});
