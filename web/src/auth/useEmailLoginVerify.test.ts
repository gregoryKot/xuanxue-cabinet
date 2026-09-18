// Хук в изоляции, без экрана (тот же приём, что useTelegramAuthResultLogin.test.ts):
// useNavigate замокан отдельно от react-router-dom. `token` управляется тестом
// напрямую — гонка «пока не известно про сессию» проверяется на уровне
// экрана (EmailLoginCallbackScreen.test.tsx), тут — только сам механизм
// «token не null → verify запускается один раз».
import { renderHook, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as RouterModule from 'react-router-dom';
import type * as HttpModule from '../api/http';
import { ApiError, apiFetch } from '../api/http';
import { saveReturnTo } from './returnTo';
import { useEmailLoginVerify } from './useEmailLoginVerify';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

const navigateMock = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof RouterModule>('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

const mockedApiFetch = vi.mocked(apiFetch);
const TOKEN = 'a'.repeat(64);

afterEach(() => {
  mockedApiFetch.mockReset();
  navigateMock.mockReset();
  sessionStorage.clear();
});

describe('useEmailLoginVerify', () => {
  it('token null — не отправляет verify; статус с самого начала pending, не idle (страница уже «входит»)', () => {
    const refresh = vi.fn().mockResolvedValue(undefined);

    const { result } = renderHook(() => useEmailLoginVerify(refresh, null));

    expect(result.current.status).toBe('pending');
    expect(result.current.error).toBeNull();
    expect(mockedApiFetch).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('token валиден с самого начала — POST /auth/email/verify уходит один раз, без вызовов извне', async () => {
    mockedApiFetch.mockResolvedValue(undefined);
    const refresh = vi.fn().mockResolvedValue(undefined);

    renderHook(() => useEmailLoginVerify(refresh, TOKEN));

    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith('/', { replace: true }),
    );
    expect(mockedApiFetch).toHaveBeenCalledWith('/auth/email/verify', {
      method: 'POST',
      body: { token: TOKEN },
    });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('token появляется не сразу (экран ждёт AuthProvider) — verify запускается, как только он не null', async () => {
    mockedApiFetch.mockResolvedValue(undefined);
    const refresh = vi.fn().mockResolvedValue(undefined);
    const { rerender } = renderHook(
      ({ token }: { token: string | null }) => useEmailLoginVerify(refresh, token),
      { initialProps: { token: null as string | null } },
    );

    expect(mockedApiFetch).not.toHaveBeenCalled();

    rerender({ token: TOKEN });

    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith('/', { replace: true }),
    );
    expect(mockedApiFetch).toHaveBeenCalledWith('/auth/email/verify', {
      method: 'POST',
      body: { token: TOKEN },
    });
  });

  it('успех, сохранён returnTo /planning?week=2 (аудит L2) — переход туда', async () => {
    saveReturnTo('/planning?week=2');
    mockedApiFetch.mockResolvedValue(undefined);
    const refresh = vi.fn().mockResolvedValue(undefined);

    renderHook(() => useEmailLoginVerify(refresh, TOKEN));

    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith('/planning?week=2', { replace: true }),
    );
  });

  it('ApiError — status error, текст с сервера, refresh() и переход не вызваны', async () => {
    mockedApiFetch.mockRejectedValue(
      new ApiError(
        'Ссылка устарела или уже использована. Запросите новую на странице входа.',
        401,
        'unauthorized',
      ),
    );
    const refresh = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useEmailLoginVerify(refresh, TOKEN));

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe(
      'Ссылка устарела или уже использована. Запросите новую на странице входа.',
    );
    // errorStatus (ревью PR #150) — экран отличает 401 (кнопка «Запросить новую»
    // нужна) от 403 (нет смысла, см. тест ниже).
    expect(result.current.errorStatus).toBe(401);
    expect(refresh).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('сетевой сбой (не ApiError) — общий текст «Нет связи…», errorStatus null', async () => {
    mockedApiFetch.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useEmailLoginVerify(vi.fn(), TOKEN));

    await waitFor(() =>
      expect(result.current.error).toBe(
        'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.',
      ),
    );
    expect(result.current.errorStatus).toBeNull();
  });

  it('joinCode (ADR-0030/0036) — inviteCode едет прямо в теле verify, без второго запроса', async () => {
    mockedApiFetch.mockResolvedValue(undefined);
    const refresh = vi.fn().mockResolvedValue(undefined);

    renderHook(() => useEmailLoginVerify(refresh, TOKEN, 'a'.repeat(32)));

    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith('/', { replace: true }),
    );
    expect(mockedApiFetch).toHaveBeenCalledWith('/auth/email/verify', {
      method: 'POST',
      body: { token: TOKEN, inviteCode: 'a'.repeat(32) },
    });
  });

  it('joinCode, verify упал (например, нет валидной ссылки) — error виден, переход не вызван', async () => {
    mockedApiFetch.mockRejectedValue(
      new ApiError(
        'Чтобы попасть в кабинет, откройте ссылку-приглашение от учителя школы.',
        403,
        'forbidden',
      ),
    );
    const refresh = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useEmailLoginVerify(refresh, TOKEN, 'a'.repeat(32)),
    );

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe(
      'Чтобы попасть в кабинет, откройте ссылку-приглашение от учителя школы.',
    );
    // errorStatus 403 (ревью PR #150) — экран не предложит «Запросить новую»:
    // новое письмо не даёт ссылку-приглашение, кнопка вернула бы в ту же петлю.
    expect(result.current.errorStatus).toBe(403);
    expect(refresh).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('StrictMode вызывает эффект дважды — POST уходит один раз (startedRef)', async () => {
    mockedApiFetch.mockResolvedValue(undefined);
    const refresh = vi.fn().mockResolvedValue(undefined);

    renderHook(() => useEmailLoginVerify(refresh, TOKEN), { wrapper: StrictMode });

    await waitFor(() => expect(navigateMock).toHaveBeenCalled());
    const verifyCalls = mockedApiFetch.mock.calls.filter(
      ([path]) => path === '/auth/email/verify',
    );
    expect(verifyCalls).toHaveLength(1);
  });

  it('перерендер с тем же token — не отправляет verify второй раз (startedRef, не только React.StrictMode)', async () => {
    mockedApiFetch.mockResolvedValue(undefined);
    const refresh = vi.fn().mockResolvedValue(undefined);
    const { rerender } = renderHook(
      ({ token }: { token: string | null }) => useEmailLoginVerify(refresh, token),
      { initialProps: { token: TOKEN } },
    );

    await waitFor(() => expect(navigateMock).toHaveBeenCalled());

    rerender({ token: TOKEN });

    const verifyCalls = mockedApiFetch.mock.calls.filter(
      ([path]) => path === '/auth/email/verify',
    );
    expect(verifyCalls).toHaveLength(1);
  });
});
