// Ссылка «У меня нет Telegram» / «Telegram у меня появился» (ADR-0067) —
// сеть замокана через apiFetch (тот же приём, что SecondLoginKey.test.tsx),
// <AuthProvider> нужен только ради useAuth().applyMe, сам `me` этому
// компоненту не идёт: он получает готовое `noTelegram` пропом.
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { MeDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { AuthProvider } from '../auth/AuthProvider';
import {
  mockApiByPath,
  mockedApiFetch,
  resetApiFetchBetweenTests,
} from '../test-support/apiFetchMock';
import { NoTelegramSwitch } from './NoTelegramSwitch';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();

// Ответ PUT /me/no-telegram (ADR-0087) — applyMe() кладёт его напрямую,
// компонент значение `noTelegram` на нём не проверяет (оно приходит пропом).
const ME_AFTER_TOGGLE: MeDto = {
  id: 'u1',
  name: 'Дима',
  roles: [],
  status: 'active',
  telegramLinked: false,
  botChatActive: false,
  hasEmail: true,
  noTelegram: true,
  needsProfile: false,
};

function renderSwitch(noTelegram: boolean) {
  mockApiByPath({
    '/auth/me': new Error('нет сессии'),
    '/me/no-telegram': ME_AFTER_TOGGLE,
  });
  return render(
    <AuthProvider>
      <NoTelegramSwitch noTelegram={noTelegram} />
    </AuthProvider>,
  );
}

describe('NoTelegramSwitch — отметки нет', () => {
  it('видна ссылка «У меня нет Telegram», объяснения нет', async () => {
    renderSwitch(false);

    expect(
      await screen.findByRole('button', { name: 'У меня нет Telegram' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Кабинет больше его не предлагает/),
    ).not.toBeInTheDocument();
  });

  it('нажатие шлёт PUT с { noTelegram: true }', async () => {
    const user = userEvent.setup();
    renderSwitch(false);

    await user.click(await screen.findByRole('button', { name: 'У меня нет Telegram' }));

    await waitFor(() =>
      expect(mockedApiFetch).toHaveBeenCalledWith('/me/no-telegram', {
        method: 'PUT',
        body: { noTelegram: true },
      }),
    );
  });
});

describe('NoTelegramSwitch — отметка стоит', () => {
  it('видно объяснение и ссылка «Telegram у меня появился»', async () => {
    renderSwitch(true);

    expect(
      await screen.findByText(/Вы сказали, что Telegram у вас нет/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Telegram у меня появился' }),
    ).toBeInTheDocument();
  });

  it('нажатие шлёт PUT с { noTelegram: false }', async () => {
    const user = userEvent.setup();
    renderSwitch(true);

    await user.click(
      await screen.findByRole('button', { name: 'Telegram у меня появился' }),
    );

    await waitFor(() =>
      expect(mockedApiFetch).toHaveBeenCalledWith('/me/no-telegram', {
        method: 'PUT',
        body: { noTelegram: false },
      }),
    );
  });
});
