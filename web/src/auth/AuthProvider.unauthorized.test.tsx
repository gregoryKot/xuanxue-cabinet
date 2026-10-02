// Отдельный файл — здесь http.ts НЕ замокан (vi.mock только на fetch), чтобы
// проверить реальную склейку: AuthProvider регистрирует clear() как
// unauthorizedListener в http.ts, и 401 из любого apiFetch-запроса (не
// только своего /auth/me) уводит сессию в guest (CLAUDE.md, ревью п.12).
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '../api/http';
import { AuthProvider, useAuth } from './AuthProvider';

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    // http.ts читает заголовок версии сборки на каждом ответе (ADR-0101) —
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

  // Аудит 2026-10-01, F56: порядок refresh#1 (401, задержан) → POST входа
  // → refresh#2 (200) → долетает 401 от #1. Раньше слушатель 401 звал clear()
  // безусловно: requestId сдвигался, ответ #2 отбрасывался, статус — guest,
  // и человека с выданной cookie возвращало на экран входа.
  it('запоздавший 401 стартового /auth/me после удачного входа не затирает сессию', async () => {
    let resolveFirst: (response: Response) => void = () => undefined;
    const first = new Promise<Response>((resolve) => {
      resolveFirst = resolve;
    });
    const me = { id: 'u1', name: 'Ученик', roles: ['student'] };
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => first)
      .mockImplementation(() => Promise.resolve(jsonResponse(200, me)));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    expect(result.current.status).toBe('loading');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // POST /auth/telegram завершился — хук входа зовёт refresh(): второй GET.
    let refreshDone: Promise<void> = Promise.resolve();
    act(() => {
      refreshDone = result.current.refresh();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Теперь долетает 401 от первого запроса.
    await act(async () => {
      resolveFirst(
        jsonResponse(401, { statusCode: 401, code: 'unauthorized', message: 'Войдите' }),
      );
      await refreshDone;
    });

    await waitFor(() => expect(result.current.status).toBe('ok'));
    expect(result.current.me).toEqual(me);
  });

  it('401 до входа (гость на /login) — guest, как и раньше', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() =>
        Promise.resolve(
          jsonResponse(401, {
            statusCode: 401,
            code: 'unauthorized',
            message: 'Войдите',
          }),
        ),
      )
      .mockImplementation(() =>
        Promise.resolve(
          jsonResponse(200, { id: 'u1', name: 'Ученик', roles: ['student'] }),
        ),
      );
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useAuth(), { wrapper: AuthProvider });
    await waitFor(() => expect(result.current.status).toBe('guest'));

    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.status).toBe('ok');
  });
});
