// Форма в изоляции (тот же приём, что welcome/useProfileSetup.test.ts —
// apiFetch замокан, applyMe() — обычный колбэк, без <AuthProvider>).
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MeDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { ApiError, apiFetch } from '../api/http';
import { EmailLinkForm } from './EmailLinkForm';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

const mockedApiFetch = vi.mocked(apiFetch);

// Ответ POST /auth/email/link (ADR-0087) — applyMe() получает его напрямую.
const ME: MeDto = {
  id: 'u1',
  name: 'Дима',
  roles: [],
  status: 'active',
  telegramLinked: true,
  botChatActive: false,
  hasEmail: false,
  pendingEmail: 'a@example.com',
  noTelegram: false,
  needsProfile: false,
};

afterEach(() => {
  mockedApiFetch.mockReset();
});

describe('EmailLinkForm — кнопка «Привязать почту»', () => {
  it('недоступна при пустом поле', () => {
    render(<EmailLinkForm applyMe={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Привязать почту' })).toBeDisabled();
  });

  it('доступна, когда адрес введён', async () => {
    const user = userEvent.setup();
    render(<EmailLinkForm applyMe={vi.fn()} />);

    await user.type(screen.getByLabelText('Почта'), 'a@example.com');

    expect(screen.getByRole('button', { name: 'Привязать почту' })).toBeEnabled();
  });

  it('initialEmail подставляется в поле — кнопка сразу доступна', () => {
    render(<EmailLinkForm applyMe={vi.fn()} initialEmail="a@example.com" />);

    expect(screen.getByLabelText('Почта')).toHaveValue('a@example.com');
    expect(screen.getByRole('button', { name: 'Привязать почту' })).toBeEnabled();
  });
});

describe('EmailLinkForm — «Оставить прежний адрес»', () => {
  it('без onCancel ссылки нет', () => {
    render(<EmailLinkForm applyMe={vi.fn()} />);

    expect(
      screen.queryByRole('button', { name: 'Оставить прежний адрес' }),
    ).not.toBeInTheDocument();
  });

  it('с onCancel ссылка есть и зовёт его', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(<EmailLinkForm applyMe={vi.fn()} onCancel={onCancel} />);

    await user.click(screen.getByRole('button', { name: 'Оставить прежний адрес' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

describe('EmailLinkForm — отправка', () => {
  it('успех — POST /auth/email/link с введённым адресом, затем applyMe(next)', async () => {
    const user = userEvent.setup();
    mockedApiFetch.mockResolvedValue(ME);
    const applyMe = vi.fn();
    render(<EmailLinkForm applyMe={applyMe} />);

    await user.type(screen.getByLabelText('Почта'), 'a@example.com');
    await user.click(screen.getByRole('button', { name: 'Привязать почту' }));

    expect(mockedApiFetch).toHaveBeenCalledWith('/auth/email/link', {
      method: 'POST',
      body: { email: 'a@example.com' },
    });
    await vi.waitFor(() => expect(applyMe).toHaveBeenCalledWith(ME));
  });

  it('409 — текст сервера показан под полем', async () => {
    const user = userEvent.setup();
    mockedApiFetch.mockRejectedValue(
      new ApiError(
        'К этому аккаунту кабинета уже привязана другая почта.',
        409,
        'conflict',
      ),
    );
    render(<EmailLinkForm applyMe={vi.fn()} />);

    await user.type(screen.getByLabelText('Почта'), 'a@example.com');
    await user.click(screen.getByRole('button', { name: 'Привязать почту' }));

    expect(
      await screen.findByText('К этому аккаунту кабинета уже привязана другая почта.'),
    ).toBeInTheDocument();
  });
});
