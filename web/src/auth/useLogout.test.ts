// Выход — одна механика на два экрана (useLogout.ts), поэтому её исходы
// проверяются здесь один раз, а не копией в тесте каждого экрана.
// lib/formDraft.ts не замокан — clearAllDrafts() проверяем на настоящем
// localStorage, как AuthProvider.unauthorized.test.tsx проверяет реальный http.ts.
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as HttpModule from '../api/http';
import { writeDraft } from '../lib/formDraft';
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

afterEach(() => {
  localStorage.clear();
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

  // ADR-0046: явный выход стирает черновики форм редактора; 401 (не через
  // этот хук) — нет, человек войдёт заново и увидит набранное.
  it('успех — чистит черновики форм редактора', async () => {
    writeDraft('exam-item:e1', { prompt: 'Черновик' }, Date.now());
    mockedApiFetch.mockResolvedValue(undefined);

    await runLogout();

    expect(localStorage.getItem('xuanxue.draft.exam-item:e1')).toBeNull();
  });

  it('сбой выхода — черновики остаются на месте', async () => {
    writeDraft('exam-item:e1', { prompt: 'Черновик' }, Date.now());
    mockedApiFetch.mockRejectedValue(new Error('network down'));

    await runLogout();

    expect(localStorage.getItem('xuanxue.draft.exam-item:e1')).not.toBeNull();
  });
});
