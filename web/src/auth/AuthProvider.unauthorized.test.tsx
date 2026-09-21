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
    // http.ts читает заголовок версии сборки на каждом ответе (ADR-0099) —
    // без headers.get apiFetch упал бы здесь ещё до проверки статуса. Тип
    // сужен до Pick<Headers, 'get'>: целый Headers подделывать незачем, а
    // `as Headers` на самом литерале tsc не пропускает (TS2352).
    headers: { get: () => null } as Pick<Headers, 'get'>,
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
