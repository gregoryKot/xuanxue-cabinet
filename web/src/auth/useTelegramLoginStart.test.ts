// Хук кнопки «Войти через Telegram» (useTelegramLoginStart.ts) на границах,
// которых нет на экране: конфигурации ещё нет, бота нет. Основные пути —
// TelegramLoginSection.test.tsx.
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuthConfigDto } from '@xuanxue/shared';
import type * as TelegramRedirectModule from './telegramAuthRedirect';
import { redirectCurrentTab, redirectToTelegramAuth } from './telegramAuthRedirect';
import { useTelegramLoginStart } from './useTelegramLoginStart';

vi.mock('./telegramAuthRedirect', async () => {
  const actual = await vi.importActual<typeof TelegramRedirectModule>(
    './telegramAuthRedirect',
  );
  return { ...actual, redirectCurrentTab: vi.fn(), redirectToTelegramAuth: vi.fn() };
});

const redirectSpy = vi.mocked(redirectCurrentTab);
const legacyRedirectSpy = vi.mocked(redirectToTelegramAuth);

const CONFIG: AuthConfigDto = {
  emailLoginEnabled: false,
  fileStorageEnabled: false,
  googleLoginEnabled: false,
  telegramOidcEnabled: false,
};

afterEach(() => {
  redirectSpy.mockClear();
  legacyRedirectSpy.mockClear();
});

function startWith(config: AuthConfigDto | null) {
  const { result } = renderHook(() => useTelegramLoginStart(config));
  act(() => result.current[1]());
  return result;
}

describe('useTelegramLoginStart', () => {
  it('конфигурации нет — никуда не уводит и кнопку не занимает', () => {
    const result = startWith(null);

    expect(redirectSpy).not.toHaveBeenCalled();
    expect(legacyRedirectSpy).not.toHaveBeenCalled();
    expect(result.current[0]).toBe(false);
  });

  it('прежний вход без бота — уводить некуда, кнопка не занята', () => {
    const result = startWith(CONFIG);

    expect(legacyRedirectSpy).not.toHaveBeenCalled();
    expect(result.current[0]).toBe(false);
  });

  it('OpenID Connect — старт на сервере, бот не нужен, кнопка занята', () => {
    const result = startWith({ ...CONFIG, telegramOidcEnabled: true });

    expect(redirectSpy).toHaveBeenCalledWith('/api/auth/telegram/oidc/start');
    expect(result.current[0]).toBe(true);
  });
});
