// Кнопка «Войти через Telegram» (TelegramLoginSection.tsx) уводит вкладку
// двумя путями (useTelegramLoginStart.ts): OpenID Connect через сервер, когда
// `config.telegramOidcEnabled` (ADR-0187), и прежним переходом на
// oauth.telegram.org, пока секрет из BotFather не заведён (ADR-0028). Переходы
// замоканы: настоящий window.location.assign увёл бы jsdom со страницы.
// Экраны входа и приглашения проверяют кнопку в своих тестах на прежнем пути —
// здесь оба пути рядом, на самом блоке.
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuthConfigDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { ApiError } from '../api/http';
import { mockApiByPath, resetApiFetchBetweenTests } from '../test-support/apiFetchMock';
import { AuthProvider } from './AuthProvider';
import type * as TelegramRedirectModule from './telegramAuthRedirect';
import { redirectCurrentTab, redirectToTelegramAuth } from './telegramAuthRedirect';
import { TelegramLoginSection } from './TelegramLoginSection';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

vi.mock('./telegramAuthRedirect', async () => {
  const actual = await vi.importActual<typeof TelegramRedirectModule>(
    './telegramAuthRedirect',
  );
  return { ...actual, redirectCurrentTab: vi.fn(), redirectToTelegramAuth: vi.fn() };
});

const redirectSpy = vi.mocked(redirectCurrentTab);
const legacyRedirectSpy = vi.mocked(redirectToTelegramAuth);
resetApiFetchBetweenTests();

const BOT_ID = 123456;
const INVITE_CODE = 'a'.repeat(32);
const BASE_CONFIG: AuthConfigDto = {
  telegramBotId: BOT_ID,
  emailLoginEnabled: false,
  fileStorageEnabled: false,
  googleLoginEnabled: false,
  telegramOidcEnabled: false,
};

afterEach(() => {
  redirectSpy.mockClear();
  legacyRedirectSpy.mockClear();
  window.location.hash = '';
});

function renderSection(config: AuthConfigDto, inviteCode?: string) {
  mockApiByPath({ '/auth/me': new ApiError('Войдите', 401, 'unauthorized') });
  return render(
    <MemoryRouter>
      <AuthProvider>
        <TelegramLoginSection
          config={config}
          configStatus="ok"
          onReload={() => Promise.resolve()}
          inviteCode={inviteCode}
        />
      </AuthProvider>
    </MemoryRouter>,
  );
}

async function clickLogin() {
  const button = await screen.findByRole('button', { name: 'Войти через Telegram' });
  await userEvent.setup().click(button);
  return button;
}

describe('TelegramLoginSection — OpenID Connect включён', () => {
  const oidcConfig = { ...BASE_CONFIG, telegramOidcEnabled: true };

  it('клик уводит вкладку на старт на сервере и оставляет кнопку занятой', async () => {
    renderSection(oidcConfig);

    const button = await clickLogin();

    expect(redirectSpy).toHaveBeenCalledTimes(1);
    expect(redirectSpy).toHaveBeenCalledWith('/api/auth/telegram/oidc/start');
    expect(legacyRedirectSpy).not.toHaveBeenCalled();
    await waitFor(() => expect(button).toBeDisabled());
  });

  it('с кодом приглашения (страница /join/:code) — join едет в query старта', async () => {
    renderSection(oidcConfig, INVITE_CODE);

    await clickLogin();

    expect(redirectSpy).toHaveBeenCalledWith(
      `/api/auth/telegram/oidc/start?join=${INVITE_CODE}`,
    );
  });

  it('подсказка под кнопкой — та же: вкладка та же, возврат туда же', async () => {
    renderSection(oidcConfig);

    await screen.findByRole('button', { name: 'Войти через Telegram' });

    expect(screen.getByText(/Откроется Telegram/)).toHaveTextContent(
      'Откроется Telegram в этой же вкладке и вернёт вас обратно.',
    );
    expect(screen.getByText('в этой же вкладке').tagName).toBe('STRONG');
  });
});

describe('TelegramLoginSection — OpenID Connect выключен (прежний вход)', () => {
  it('клик уводит вкладку на Telegram с botId, сервер не зовётся', async () => {
    renderSection(BASE_CONFIG, INVITE_CODE);

    const button = await clickLogin();

    expect(legacyRedirectSpy).toHaveBeenCalledTimes(1);
    expect(legacyRedirectSpy).toHaveBeenCalledWith(BOT_ID);
    expect(redirectSpy).not.toHaveBeenCalled();
    await waitFor(() => expect(button).toBeDisabled());
  });
});
