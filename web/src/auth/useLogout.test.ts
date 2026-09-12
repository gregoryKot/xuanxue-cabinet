// Выход — одна механика на два экрана (useLogout.ts), поэтому её исходы
// проверяются здесь один раз, а не копией в тесте каждого экрана.
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as HttpModule from '../api/http';
import { mockedApiFetch, resetApiFetchBetweenTests } from '../test-support/apiFetchMock';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

const navigate = vi.fn();
const clear = vi.fn();

vi.mock('react-router-dom', () => ({ useNavigate: () => navigate }));
vi.mock('./AuthProvider', () => ({ useAuth: () => ({ clear }) }));

resetApiFetchBetweenTests();

// navigate и clear — заглушки на уровне модуля: без сброса вызов из соседнего
// теста засчитался бы этому.
beforeEach(() => {
  navigate.mockClear();
  clear.mockClear();
});

async function runLogout() {
  const { useLogout } = await import('./useLogout');
  const { result } = renderHook(() => useLogout());
  await result.current.logout();
  return result;
}

describe('useLogout', () => {
  it('успех: POST /auth/logout, сессия очищена, переход на вход', async () => {
    mockedApiFetch.mockResolvedValue(undefined);

    const result = await runLogout();

    expect(mockedApiFetch).toHaveBeenCalledWith(
      '/auth/logout',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(clear).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith('/login', { replace: true });
    await waitFor(() => expect(result.current.error).toBeNull());
  });

  // Текст сервера важнее нашего: он объясняет, почему выйти не вышло.
  it('ApiError — показываем текст сервера, на вход не уводим', async () => {
    const { ApiError } = await import('../api/http');
    mockedApiFetch.mockRejectedValue(new ApiError('Сбой сервера', 500, 'unknown'));

    const result = await runLogout();

    await waitFor(() => expect(result.current.error).toBe('Сбой сервера'));
    expect(navigate).not.toHaveBeenCalledWith('/login', { replace: true });
  });

  it('любая другая ошибка — общий текст', async () => {
    mockedApiFetch.mockRejectedValue(new Error('network down'));

    const result = await runLogout();

    await waitFor(() =>
      expect(result.current.error).toBe('Не удалось выйти. Попробуйте ещё раз.'),
    );
  });
});
