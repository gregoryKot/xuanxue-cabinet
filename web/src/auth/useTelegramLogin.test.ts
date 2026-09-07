// Скрипт telegram-widget.js в jsdom не грузится сам — вручную диспатчим
// событие 'load' на вставленный <script>, как сделал бы реальный браузер.
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TelegramLoginInput } from '@xuanxue/shared';
import { __resetTelegramWidgetForTests, useTelegramLogin } from './useTelegramLogin';

function fireScriptLoad() {
  const script = document.head.querySelector('script[src*="telegram-widget"]');
  script?.dispatchEvent(new Event('load'));
}

function fireScriptError() {
  const script = document.head.querySelector('script[src*="telegram-widget"]');
  script?.dispatchEvent(new Event('error'));
}

afterEach(() => {
  __resetTelegramWidgetForTests();
  delete window.Telegram;
  document.head.innerHTML = '';
});

describe('useTelegramLogin', () => {
  it('без botId скрипт не грузится, ready остаётся false', () => {
    renderHook(() => useTelegramLogin(undefined));

    expect(document.head.querySelector('script[src*="telegram-widget"]')).toBeNull();
  });

  it('с botId вставляет script, ready становится true после load', async () => {
    const { result } = renderHook(() => useTelegramLogin(123456));

    expect(document.head.querySelector('script[src*="telegram-widget"]')).not.toBeNull();
    act(() => fireScriptLoad());

    await waitFor(() => expect(result.current.ready).toBe(true));
  });

  it('скрипт не загрузился (событие error) — ready остаётся false', async () => {
    const { result } = renderHook(() => useTelegramLogin(123456));

    act(() => fireScriptError());

    // Ждём микротаска catch-обработчика — ready не должен стать true.
    await waitFor(() => expect(result.current.ready).toBe(false));
  });

  it('login() вызывает window.Telegram.Login.auth и резолвится пользователем', async () => {
    const { result } = renderHook(() => useTelegramLogin(123456));
    act(() => fireScriptLoad());
    await waitFor(() => expect(result.current.ready).toBe(true));

    const fakeUser: TelegramLoginInput = {
      id: 42,
      first_name: 'Дима',
      auth_date: 1_700_000_000,
      hash: 'a'.repeat(64),
    };
    window.Telegram = {
      Login: {
        auth: vi.fn(
          (_options: unknown, callback: (u: TelegramLoginInput | false) => void) =>
            callback(fakeUser),
        ),
      },
    };

    const user = await result.current.login();

    expect(user).toEqual(fakeUser);
    expect(window.Telegram.Login.auth).toHaveBeenCalledWith(
      { bot_id: 123456, request_access: 'write' },
      expect.any(Function),
    );
  });

  it('пользователь закрыл попап (callback(false)) — login() резолвится null', async () => {
    const { result } = renderHook(() => useTelegramLogin(123456));
    act(() => fireScriptLoad());
    await waitFor(() => expect(result.current.ready).toBe(true));

    window.Telegram = {
      Login: {
        auth: vi.fn(
          (_options: unknown, callback: (u: TelegramLoginInput | false) => void) =>
            callback(false),
        ),
      },
    };

    await expect(result.current.login()).resolves.toBeNull();
  });

  it('login() без botId отклоняется', async () => {
    const { result } = renderHook(() => useTelegramLogin(undefined));

    await expect(result.current.login()).rejects.toThrow('ещё не загрузился');
  });
});
