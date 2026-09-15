// Форма «Нет Telegram? Войдите по почте» в изоляции (LoginScreen.test.tsx
// проверяет только то, что блок появляется/пропадает по emailLoginEnabled).
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as HttpModule from '../api/http';
import { ApiError, apiFetch } from '../api/http';
import { EmailLoginForm } from './EmailLoginForm';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

const mockedApiFetch = vi.mocked(apiFetch);

afterEach(() => {
  mockedApiFetch.mockReset();
});

describe('EmailLoginForm', () => {
  it('пустое поле — кнопка недоступна', () => {
    render(<EmailLoginForm />);
    expect(
      screen.getByRole('button', { name: 'Получить ссылку для входа' }),
    ).toBeDisabled();
  });

  it('inviteCode (ADR-0030) — уходит в теле запроса вместе с email', async () => {
    const user = userEvent.setup();
    mockedApiFetch.mockResolvedValue(undefined);
    render(<EmailLoginForm inviteCode={'a'.repeat(32)} />);

    await user.type(screen.getByLabelText('Почта'), 'a@example.com');
    await user.click(screen.getByRole('button', { name: 'Получить ссылку для входа' }));

    await screen.findByText(/Письмо ушло/);
    expect(mockedApiFetch).toHaveBeenCalledWith('/auth/email/request', {
      method: 'POST',
      body: { email: 'a@example.com', inviteCode: 'a'.repeat(32) },
    });
  });

  it('успех — «Письмо ушло на …», форма пропадает', async () => {
    const user = userEvent.setup();
    mockedApiFetch.mockResolvedValue(undefined);
    render(<EmailLoginForm />);

    await user.type(screen.getByLabelText('Почта'), 'a@example.com');
    await user.click(screen.getByRole('button', { name: 'Получить ссылку для входа' }));

    expect(await screen.findByText(/Письмо ушло на a@example\.com/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Почта')).not.toBeInTheDocument();
  });

  it('«Отправить ещё раз» шлёт второй запрос с тем же адресом, экран не возвращается к форме', async () => {
    const user = userEvent.setup();
    mockedApiFetch.mockResolvedValue(undefined);
    render(<EmailLoginForm />);

    await user.type(screen.getByLabelText('Почта'), 'a@example.com');
    await user.click(screen.getByRole('button', { name: 'Получить ссылку для входа' }));
    await screen.findByText(/Письмо ушло/);

    await user.click(screen.getByRole('button', { name: 'Отправить ещё раз' }));

    expect(mockedApiFetch).toHaveBeenCalledTimes(2);
    expect(mockedApiFetch).toHaveBeenLastCalledWith('/auth/email/request', {
      method: 'POST',
      body: { email: 'a@example.com' },
    });
    expect(await screen.findByText(/Письмо ушло/)).toBeInTheDocument();
  });

  it('ошибка до первого успеха — текст под полем, форма остаётся', async () => {
    const user = userEvent.setup();
    mockedApiFetch.mockRejectedValue(
      new ApiError('Email-вход пока не подключён.', 503, 'not_available'),
    );
    render(<EmailLoginForm />);

    await user.type(screen.getByLabelText('Почта'), 'a@example.com');
    await user.click(screen.getByRole('button', { name: 'Получить ссылку для входа' }));

    expect(await screen.findByText('Email-вход пока не подключён.')).toBeInTheDocument();
    expect(screen.getByLabelText('Почта')).toBeInTheDocument();
  });

  it('сбой «Отправить ещё раз» — текст ошибки поверх экрана «отправлено», форма не возвращается', async () => {
    const user = userEvent.setup();
    mockedApiFetch.mockResolvedValueOnce(undefined);
    render(<EmailLoginForm />);
    await user.type(screen.getByLabelText('Почта'), 'a@example.com');
    await user.click(screen.getByRole('button', { name: 'Получить ссылку для входа' }));
    await screen.findByText(/Письмо ушло/);

    mockedApiFetch.mockRejectedValueOnce(new Error('boom'));
    await user.click(screen.getByRole('button', { name: 'Отправить ещё раз' }));

    expect(await screen.findByText(/Нет связи с сервером/)).toBeInTheDocument();
    expect(screen.getByText(/Письмо ушло/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Почта')).not.toBeInTheDocument();
  });
});
