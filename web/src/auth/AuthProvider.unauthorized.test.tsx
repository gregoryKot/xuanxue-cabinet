// Отдельный файл — здесь http.ts НЕ замокан (vi.mock только на fetch), чтобы
// проверить реальную склейку: AuthProvider регистрирует clear() как
// unauthorizedListener в http.ts, и 401 из любого apiFetch-запроса (не
// только своего /auth/me) уводит сессию в guest (CLAUDE.md, ревью п.12).
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '../api/http';
import { AuthProvider, useAuth } from './AuthProvider';

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AuthProvider — реальный http.ts', () => {
  it('401 из чужого запроса (не /auth/me) после успешного входа сбрасывает сессию в guest', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      jsonResponse(200, {
        id: 'u1',
        name: 'Дима',
        roles: ['teacher'],
        tz: 'Asia/Jerusalem',
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    await waitFor(() => expect(result.current.status).toBe('ok'));

    fetchMock.mockResolvedValueOnce(
      jsonResponse(401, { statusCode: 401, code: 'unauthorized', message: 'Войдите' }),
    );
    await expect(apiFetch('/classes')).rejects.toThrow();

    await waitFor(() => expect(result.current.status).toBe('guest'));
  });
});
