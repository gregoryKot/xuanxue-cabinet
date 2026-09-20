// Ветки показа (CLAUDE.md «Тесты») — что предложить, решает `me` и
// конфигурация email-входа (useAuthConfig). <AuthProvider> нужен только ради
// useAuth().refresh — сам `me`, который решает, что показать, приходит
// пропом, не из сессии (тот же приём мока сети, что TelegramLinkButton.test.tsx).
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { MeDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import {
  mockApiByPath,
  mockedApiFetch,
  resetApiFetchBetweenTests,
} from '../test-support/apiFetchMock';
import { AuthProvider } from './AuthProvider';
import { SecondLoginKey } from './SecondLoginKey';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();

const BASE: MeDto = {
  id: 'u1',
  name: 'Мария Ли',
  roles: [],
  status: 'active',
  telegramLinked: true,
  botChatActive: true,
  hasEmail: true,
  needsProfile: false,
};

function renderKey(me: MeDto, config: unknown = { emailLoginEnabled: true }) {
  mockApiByPath({ '/auth/me': new Error('нет сессии'), '/auth/config': config });
  return render(
    <AuthProvider>
      <SecondLoginKey me={me} />
    </AuthProvider>,
  );
}

describe('SecondLoginKey — только почта нужна', () => {
  it('Telegram связан, почты нет — форма почты и её объяснение, кнопки Telegram нет', async () => {
    renderKey({ ...BASE, hasEmail: false });

    expect(
      await screen.findByText(/Сейчас в кабинет пускает только Telegram/),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Привязать почту' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Связать Telegram' }),
    ).not.toBeInTheDocument();
  });
});

describe('SecondLoginKey — только Telegram нужен', () => {
  it('почта есть, Telegram не связан — кнопка связки и её объяснение, формы почты нет', async () => {
    renderKey({ ...BASE, telegramLinked: false });

    expect(
      await screen.findByText(/Сейчас в кабинет пускает только почта/),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Связать Telegram' })).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Привязать почту' }),
    ).not.toBeInTheDocument();
  });
});

describe('SecondLoginKey — оба ключа на месте', () => {
  it('ничего не рисует', () => {
    const { container } = renderKey(BASE);

    expect(container).toBeEmptyDOMElement();
  });
});

describe('SecondLoginKey — почта выключена конфигурацией школы', () => {
  it('emailLoginEnabled: false — формы почты нет, даже если почта не привязана', async () => {
    renderKey(
      { ...BASE, telegramLinked: false, hasEmail: false },
      { emailLoginEnabled: false },
    );

    await screen.findByRole('button', { name: 'Связать Telegram' });
    await waitFor(() => expect(mockedApiFetch).toHaveBeenCalledWith('/auth/config'));

    expect(
      screen.queryByRole('button', { name: 'Привязать почту' }),
    ).not.toBeInTheDocument();
  });
});

describe('SecondLoginKey — pendingEmail', () => {
  it('адрес уже назван — напоминание вместо формы', async () => {
    renderKey({ ...BASE, hasEmail: false, pendingEmail: 'a@example.com' });

    expect(
      await screen.findByText(/Мы отправили ссылку на a@example\.com/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Привязать почту' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Прислать ссылку ещё раз' }),
    ).toBeInTheDocument();
  });
});
