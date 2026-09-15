// Юнит-тест хука без DOM (CLAUDE.md «Тесты»). Сеть — мок apiFetch.
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as HttpModule from '../api/http';
import { apiFetch } from '../api/http';
import { useInviteLink } from './useInviteLink';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

const mockedApiFetch = vi.mocked(apiFetch);

afterEach(() => {
  mockedApiFetch.mockReset();
});

describe('useInviteLink', () => {
  it('загружает текущую ссылку через GET /users/invite-link', async () => {
    mockedApiFetch.mockResolvedValue({ url: 'https://xuanxue.su/join/abc' });

    const { result } = renderHook(() => useInviteLink());

    await waitFor(() =>
      expect(result.current.link).toEqual({ url: 'https://xuanxue.su/join/abc' }),
    );
    expect(mockedApiFetch).toHaveBeenCalledWith(
      '/users/invite-link',
      expect.objectContaining({}),
    );
  });

  it('ссылки ещё нет — link.url: null, не ошибка загрузки', async () => {
    mockedApiFetch.mockResolvedValue({ url: null });

    const { result } = renderHook(() => useInviteLink());

    await waitFor(() => expect(result.current.link).toEqual({ url: null }));
    expect(result.current.error).toBeNull();
  });

  it('rotate(): read-after-write — link сразу отдаёт новый url из ответа POST', async () => {
    mockedApiFetch.mockImplementation((_path: string, init?: { method?: string }) => {
      if (init?.method === 'POST')
        return Promise.resolve({ url: 'https://xuanxue.su/join/new' });
      return Promise.resolve({ url: 'https://xuanxue.su/join/old' });
    });
    const { result } = renderHook(() => useInviteLink());
    await waitFor(() =>
      expect(result.current.link?.url).toBe('https://xuanxue.su/join/old'),
    );

    await act(() => result.current.rotate());

    expect(result.current.link).toEqual({ url: 'https://xuanxue.su/join/new' });
    expect(mockedApiFetch).toHaveBeenCalledWith('/users/invite-link', { method: 'POST' });
  });

  it('rotate() падает — rotateError, прежняя ссылка остаётся видна', async () => {
    mockedApiFetch.mockImplementation((_path: string, init?: { method?: string }) => {
      if (init?.method === 'POST') return Promise.reject(new Error('boom'));
      return Promise.resolve({ url: 'https://xuanxue.su/join/old' });
    });
    const { result } = renderHook(() => useInviteLink());
    await waitFor(() =>
      expect(result.current.link?.url).toBe('https://xuanxue.su/join/old'),
    );

    await act(() => result.current.rotate());

    expect(result.current.rotateError).toBe(
      'Не удалось создать ссылку. Попробуйте ещё раз.',
    );
    expect(result.current.link?.url).toBe('https://xuanxue.su/join/old');
    expect(result.current.rotating).toBe(false);
  });
});
