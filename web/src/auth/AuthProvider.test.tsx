import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MeDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { ApiError, apiFetch } from '../api/http';
import { AuthProvider, hasSession, useAuth } from './AuthProvider';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

const mockedApiFetch = vi.mocked(apiFetch);

afterEach(() => {
  mockedApiFetch.mockReset();
});

function renderAuth() {
  return renderHook(() => useAuth(), { wrapper: AuthProvider });
}

describe('useAuth вне AuthProvider', () => {
  it('бросает понятную ошибку', () => {
    expect(() => renderHook(() => useAuth())).toThrow('useAuth() вызван вне');
  });
});

describe('AuthProvider — статусы', () => {
  it('успешный /auth/me — status ok, me заполнен', async () => {
    const me: MeDto = {
      id: 'u1',
      name: 'Дима',
      roles: ['teacher'],
      status: 'active',
      telegramLinked: false,
      botChatActive: false,
      noTelegram: false,
      hasEmail: true,
      needsProfile: false,
    };
    mockedApiFetch.mockResolvedValue(me);

    const { result } = renderAuth();

    await waitFor(() => expect(result.current.status).toBe('ok'));
    expect(result.current.me).toEqual(me);
  });

  it('401 — status guest', async () => {
    mockedApiFetch.mockRejectedValue(new ApiError('Войдите', 401, 'unauthorized'));

    const { result } = renderAuth();

    await waitFor(() => expect(result.current.status).toBe('guest'));
    expect(result.current.me).toBeNull();
  });

  it('сетевой сбой (status 0) — offline, не guest', async () => {
    mockedApiFetch.mockRejectedValue(new ApiError('Нет связи', 0, 'network'));

    const { result } = renderAuth();

    await waitFor(() => expect(result.current.status).toBe('offline'));
  });

  // Задача 3: AuthGuard отвергает status: 'blocked' 403-м на каждый запрос
  // (SECURITY §2) — cookie при этом валиден, это не «сессии нет».
  it('403 — status blocked, me null', async () => {
    mockedApiFetch.mockRejectedValue(
      new ApiError('Доступа нет. Обратитесь к администратору школы.', 403, 'forbidden'),
    );

    const { result } = renderAuth();

    await waitFor(() => expect(result.current.status).toBe('blocked'));
    expect(result.current.me).toBeNull();
  });

  it('clear() сбрасывает сессию до guest', async () => {
    const me: MeDto = {
      id: 'u1',
      name: 'Дима',
      roles: ['teacher'],
      status: 'active',
      telegramLinked: false,
      botChatActive: false,
      noTelegram: false,
      hasEmail: true,
      needsProfile: false,
    };
    mockedApiFetch.mockResolvedValue(me);
    const { result } = renderAuth();
    await waitFor(() => expect(result.current.status).toBe('ok'));

    act(() => {
      result.current.clear();
    });

    expect(result.current.status).toBe('guest');
    expect(result.current.me).toBeNull();
  });
});

describe('AuthProvider — applyMe (ADR-0087)', () => {
  it('applyMe() кладёт профиль и переводит статус в ok, не делая запроса', async () => {
    mockedApiFetch.mockRejectedValue(new ApiError('Войдите', 401, 'unauthorized'));
    const { result } = renderAuth();
    await waitFor(() => expect(result.current.status).toBe('guest'));
    const callsBeforeApply = mockedApiFetch.mock.calls.length;

    const me: MeDto = {
      id: 'u1',
      name: 'Дима',
      roles: ['teacher'],
      status: 'active',
      telegramLinked: false,
      botChatActive: false,
      noTelegram: false,
      hasEmail: true,
      needsProfile: false,
    };

    act(() => {
      result.current.applyMe(me);
    });

    expect(result.current.me).toEqual(me);
    expect(result.current.status).toBe('ok');
    // Ни PATCH/PUT/POST записи (уже отработал раньше в вызывающем хуке), ни
    // тем более новый GET — applyMe() только кладёт то, что уже на руках.
    expect(mockedApiFetch).toHaveBeenCalledTimes(callsBeforeApply);
  });

  // Образец приёма — useAbortableFetch.test.ts, «главный тест: ответ уже
  // летящего load() после applyData() не перезаписывает применённые данные»:
  // тот же управляемый промис вместо setTimeout (CLAUDE.md «Детерминизм»).
  it('главный тест: ответ уже летящего refresh() после applyMe() не перезаписывает применённый профиль', async () => {
    const mounted: MeDto = {
      id: 'u1',
      name: 'Дима',
      roles: ['teacher'],
      status: 'active',
      telegramLinked: false,
      botChatActive: false,
      noTelegram: false,
      hasEmail: true,
      needsProfile: false,
    };
    let resolveRefresh: ((value: MeDto) => void) | undefined;
    mockedApiFetch.mockResolvedValueOnce(mounted).mockImplementationOnce(
      () =>
        new Promise<MeDto>((resolve) => {
          resolveRefresh = resolve;
        }),
    );
    const { result } = renderAuth();
    await waitFor(() => expect(result.current.status).toBe('ok'));

    // Второй refresh() (не монтирование) повисает — apiFetch ещё не ответил.
    let refreshPromise: Promise<void> | undefined;
    act(() => {
      refreshPromise = result.current.refresh();
    });
    expect(result.current.status).toBe('loading');

    // PATCH/PUT/POST записи уже ответил — applyMe() кладёт его результат,
    // пока висящий refresh() выше ещё не разрешился.
    const applied: MeDto = { ...mounted, name: 'Дима (сохранено записью)' };
    act(() => {
      result.current.applyMe(applied);
    });
    expect(result.current.me).toEqual(applied);
    expect(result.current.status).toBe('ok');

    // Висящий refresh() наконец отвечает — устаревшим к этому моменту профилем.
    await act(async () => {
      resolveRefresh?.({ ...mounted, name: 'устаревший ответ висящего refresh()' });
      await refreshPromise;
    });

    expect(result.current.me).toEqual(applied);
    expect(result.current.status).toBe('ok');
  });
});

describe('hasSession', () => {
  it('true для ok и blocked (сессия есть), false для остального', () => {
    expect(hasSession('ok')).toBe(true);
    expect(hasSession('blocked')).toBe(true);
    expect(hasSession('guest')).toBe(false);
    expect(hasSession('offline')).toBe(false);
    expect(hasSession('loading')).toBe(false);
  });
});
