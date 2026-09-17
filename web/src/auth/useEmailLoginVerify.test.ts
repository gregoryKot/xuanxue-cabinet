// Хук в изоляции, без экрана (тот же приём, что useTelegramAuthResultLogin.test.ts):
// useNavigate замокан отдельно от react-router-dom.
import { act, renderHook, waitFor } from '@testing-library/react';
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

afterEach(() => {
  mockedApiFetch.mockReset();
  navigateMock.mockReset();
  sessionStorage.clear();
});

describe('useEmailLoginVerify', () => {
  it('успех, нет сохранённого returnTo — POST /auth/email/verify, refresh(), переход на «/»', async () => {
    mockedApiFetch.mockResolvedValue(undefined);
    const refresh = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useEmailLoginVerify(refresh));

    await act(() => result.current.verify('a'.repeat(64)));

    expect(mockedApiFetch).toHaveBeenCalledWith('/auth/email/verify', {
      method: 'POST',
      body: { token: 'a'.repeat(64) },
    });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(navigateMock).toHaveBeenCalledWith('/', { replace: true });
    expect(result.current.error).toBeNull();
  });

  it('успех, сохранён returnTo /planning?week=2 (аудит L2) — переход туда', async () => {
    saveReturnTo('/planning?week=2');
    mockedApiFetch.mockResolvedValue(undefined);
    const refresh = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useEmailLoginVerify(refresh));

    await act(() => result.current.verify('a'.repeat(64)));

    expect(navigateMock).toHaveBeenCalledWith('/planning?week=2', { replace: true });
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
    const { result } = renderHook(() => useEmailLoginVerify(refresh));

    await act(() => result.current.verify('a'.repeat(64)));

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
    const { result } = renderHook(() => useEmailLoginVerify(vi.fn()));

    await act(() => result.current.verify('a'.repeat(64)));

    expect(result.current.error).toBe(
      'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.',
    );
    expect(result.current.errorStatus).toBeNull();
  });

  it('joinCode (ADR-0030/0036) — inviteCode едет прямо в теле verify, без второго запроса', async () => {
    mockedApiFetch.mockResolvedValue(undefined);
    const refresh = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useEmailLoginVerify(refresh, 'a'.repeat(32)));

    await act(() => result.current.verify('t'.repeat(64)));

    expect(mockedApiFetch).toHaveBeenCalledWith('/auth/email/verify', {
      method: 'POST',
      body: { token: 't'.repeat(64), inviteCode: 'a'.repeat(32) },
    });
    expect(navigateMock).toHaveBeenCalledWith('/', { replace: true });
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
    const { result } = renderHook(() => useEmailLoginVerify(refresh, 'a'.repeat(32)));

    await act(() => result.current.verify('t'.repeat(64)));

    expect(result.current.error).toBe(
      'Чтобы попасть в кабинет, откройте ссылку-приглашение от учителя школы.',
    );
    // errorStatus 403 (ревью PR #150) — экран не предложит «Запросить новую»:
    // новое письмо не даёт ссылку-приглашение, кнопка вернула бы в ту же петлю.
    expect(result.current.errorStatus).toBe(403);
    expect(refresh).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
  });
});
