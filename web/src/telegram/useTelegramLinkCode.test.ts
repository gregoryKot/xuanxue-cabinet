// Юнит-тест хука без формы/DOM (CLAUDE.md «Тесты») — переход pending →
// успех/сбой. Сеть замокана через apiFetch, переход в Telegram — через
// window.location (тот же приём, что telegramAuthRedirect.test.ts).
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as HttpModule from '../api/http';
import { ApiError, apiFetch } from '../api/http';
import { useTelegramLinkCode } from './useTelegramLinkCode';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

const mockedApiFetch = vi.mocked(apiFetch);

afterEach(() => {
  mockedApiFetch.mockReset();
  vi.unstubAllGlobals();
});

describe('useTelegramLinkCode', () => {
  it('изначально не занят, ошибки нет', () => {
    const { result } = renderHook(() => useTelegramLinkCode());

    expect(result.current.pending).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('успех — POST за кодом, переход текущей вкладки на telegramUrl, link() вернул true', async () => {
    const assign = vi.fn();
    vi.stubGlobal('location', {
      origin: 'https://xuanxue.su',
      href: 'https://xuanxue.su/notifications',
      assign,
    });
    mockedApiFetch.mockResolvedValue({
      telegramUrl: 'https://t.me/xuanxue_bot?start=link_' + 'a'.repeat(32),
    });
    const { result } = renderHook(() => useTelegramLinkCode());

    let linked: boolean | undefined;
    await act(async () => {
      linked = await result.current.link();
    });

    expect(linked).toBe(true);
    expect(mockedApiFetch).toHaveBeenCalledWith('/auth/telegram/link-code', {
      method: 'POST',
    });
    expect(assign).toHaveBeenCalledWith(
      'https://t.me/xuanxue_bot?start=link_' + 'a'.repeat(32),
    );
    // Вкладка уже уходит — кнопка нарочно остаётся «занятой».
    expect(result.current.pending).toBe(true);
  });

  it('ApiError с сервера — текст ошибки с сервера, link() вернул false', async () => {
    mockedApiFetch.mockRejectedValue(
      new ApiError(
        'Бот пока не подключён, связать аккаунт не получится.',
        503,
        'not_available',
      ),
    );
    const { result } = renderHook(() => useTelegramLinkCode());

    let linked: boolean | undefined;
    await act(async () => {
      linked = await result.current.link();
    });

    expect(linked).toBe(false);
    expect(result.current.pending).toBe(false);
    expect(result.current.error).toBe(
      'Бот пока не подключён, связать аккаунт не получится.',
    );
  });

  it('сетевой сбой (не ApiError) — общий текст «Нет связи…»', async () => {
    mockedApiFetch.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useTelegramLinkCode());

    await act(async () => {
      await result.current.link();
    });

    expect(result.current.error).toBe(
      'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.',
    );
  });

  it('повторный вызов сбрасывает прежнюю ошибку', async () => {
    mockedApiFetch.mockRejectedValueOnce(new Error('boom'));
    const { result } = renderHook(() => useTelegramLinkCode());
    await act(async () => {
      await result.current.link();
    });
    expect(result.current.error).not.toBeNull();

    vi.stubGlobal('location', {
      origin: 'https://xuanxue.su',
      href: 'https://xuanxue.su/notifications',
      assign: vi.fn(),
    });
    mockedApiFetch.mockResolvedValueOnce({ telegramUrl: 'https://t.me/xuanxue_bot' });
    await act(async () => {
      await result.current.link();
    });

    expect(result.current.error).toBeNull();
  });
});
