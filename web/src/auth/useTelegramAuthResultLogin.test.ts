// useNavigate замокан отдельно от react-router-dom (не через MemoryRouter +
// рендер целого экрана, как в LoginScreen.test.tsx): хук тут проверяется в
// изоляции, без остального экрана и его состояний.
import { renderHook, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TelegramLoginInput } from '@xuanxue/shared';
import type * as RouterModule from 'react-router-dom';
import type * as HttpModule from '../api/http';
import { ApiError, apiFetch } from '../api/http';
import { saveReturnTo } from './returnTo';
import { useTelegramAuthResultLogin } from './useTelegramAuthResultLogin';

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

/** Тот же способ, что у telegram-widget.js (см. telegramAuthResult.test.ts). */
function toTgAuthResultHash(user: TelegramLoginInput): string {
  const bytes = new TextEncoder().encode(JSON.stringify(user));
  const binaryString = Array.from(bytes, (b) => String.fromCharCode(b)).join('');
  const encoded = btoa(binaryString)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `#tgAuthResult=${encoded}`;
}

const fakeUser: TelegramLoginInput = {
  id: 1,
  first_name: 'Дима',
  auth_date: 1_700_000_000,
  hash: 'a'.repeat(64),
};

afterEach(() => {
  mockedApiFetch.mockReset();
  navigateMock.mockReset();
  window.location.hash = '';
  sessionStorage.clear();
});

describe('useTelegramAuthResultLogin', () => {
  it('без #tgAuthResult= в адресе — ничего не отправляет, pending/error пустые', () => {
    const refresh = vi.fn().mockResolvedValue(undefined);

    const { result } = renderHook(() => useTelegramAuthResultLogin(refresh));

    expect(result.current.pending).toBe(false);
    expect(result.current.error).toBeNull();
    expect(mockedApiFetch).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('фрагмент есть, нет сохранённого returnTo → POST /auth/telegram, refresh(), навигация на «/», фрагмент убран', async () => {
    window.location.hash = toTgAuthResultHash(fakeUser);
    mockedApiFetch.mockResolvedValue(undefined);
    const refresh = vi.fn().mockResolvedValue(undefined);

    const { result } = renderHook(() => useTelegramAuthResultLogin(refresh));

    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith('/', { replace: true }),
    );
    expect(mockedApiFetch).toHaveBeenCalledWith(
      '/auth/telegram',
      expect.objectContaining({ method: 'POST', body: fakeUser }),
    );
    expect(refresh).toHaveBeenCalled();
    expect(window.location.hash).toBe('');
    expect(result.current.pending).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('фрагмент есть, сохранён returnTo /exams (аудит L2) — навигация на него, не на «/»', async () => {
    saveReturnTo('/exams');
    window.location.hash = toTgAuthResultHash(fakeUser);
    mockedApiFetch.mockResolvedValue(undefined);
    const refresh = vi.fn().mockResolvedValue(undefined);

    renderHook(() => useTelegramAuthResultLogin(refresh));

    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith('/exams', { replace: true }),
    );
  });

  it('POST падает с ApiError — error это её текст, navigate не вызван', async () => {
    window.location.hash = toTgAuthResultHash(fakeUser);
    mockedApiFetch.mockRejectedValue(
      new ApiError('Подпись виджета не сошлась.', 401, 'unauthorized'),
    );
    const refresh = vi.fn().mockResolvedValue(undefined);

    const { result } = renderHook(() => useTelegramAuthResultLogin(refresh));

    await waitFor(() => expect(result.current.error).toBe('Подпись виджета не сошлась.'));
    expect(result.current.pending).toBe(false);
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('POST падает не ApiError — общий текст ошибки', async () => {
    window.location.hash = toTgAuthResultHash(fakeUser);
    mockedApiFetch.mockRejectedValue(new Error('boom'));
    const refresh = vi.fn().mockResolvedValue(undefined);

    const { result } = renderHook(() => useTelegramAuthResultLogin(refresh));

    await waitFor(() =>
      expect(result.current.error).toBe('Не удалось войти. Попробуйте ещё раз.'),
    );
  });

  it('navigateAfterLogin: false (JoinScreen, ADR-0030) — refresh() есть, navigate не вызван', async () => {
    window.location.hash = toTgAuthResultHash(fakeUser);
    mockedApiFetch.mockResolvedValue(undefined);
    const refresh = vi.fn().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useTelegramAuthResultLogin(refresh, { navigateAfterLogin: false }),
    );

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(result.current.pending).toBe(false);
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('inviteCode (JoinScreen, ADR-0030/0034) — в query ?join=, не в теле (подпись Telegram считается по телу целиком)', async () => {
    window.location.hash = toTgAuthResultHash(fakeUser);
    mockedApiFetch.mockResolvedValue(undefined);
    const refresh = vi.fn().mockResolvedValue(undefined);
    const inviteCode = 'a'.repeat(32);

    renderHook(() =>
      useTelegramAuthResultLogin(refresh, {
        navigateAfterLogin: false,
        inviteCode,
      }),
    );

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(mockedApiFetch).toHaveBeenCalledWith(
      `/auth/telegram?join=${inviteCode}`,
      expect.objectContaining({ method: 'POST', body: fakeUser }),
    );
  });

  it('StrictMode вызывает эффект дважды — POST уходит один раз (startedRef)', async () => {
    window.location.hash = toTgAuthResultHash(fakeUser);
    mockedApiFetch.mockResolvedValue(undefined);
    const refresh = vi.fn().mockResolvedValue(undefined);

    renderHook(() => useTelegramAuthResultLogin(refresh), { wrapper: StrictMode });

    await waitFor(() => expect(navigateMock).toHaveBeenCalled());
    const telegramCalls = mockedApiFetch.mock.calls.filter(
      ([path]) => path === '/auth/telegram',
    );
    expect(telegramCalls).toHaveLength(1);
  });
});
