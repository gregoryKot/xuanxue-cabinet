// В изоляции, как EmailLinkForm.test.tsx — apiFetch замокан, refresh()
// обычный колбэк.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as HttpModule from '../api/http';
import { apiFetch } from '../api/http';
import { PendingEmailNotice } from './PendingEmailNotice';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

const mockedApiFetch = vi.mocked(apiFetch);

afterEach(() => {
  mockedApiFetch.mockReset();
});

describe('PendingEmailNotice', () => {
  it('показывает адрес и объяснение, что делать', () => {
    render(<PendingEmailNotice email="a@example.com" refresh={vi.fn()} />);

    expect(screen.getByText(/Мы отправили ссылку на a@example\.com/)).toBeInTheDocument();
  });

  it('«Прислать ссылку ещё раз» шлёт POST /auth/email/link с тем же адресом', async () => {
    const user = userEvent.setup();
    mockedApiFetch.mockResolvedValue(undefined);
    const refresh = vi.fn().mockResolvedValue(undefined);
    render(<PendingEmailNotice email="a@example.com" refresh={refresh} />);

    await user.click(screen.getByRole('button', { name: 'Прислать ссылку ещё раз' }));

    expect(mockedApiFetch).toHaveBeenCalledWith('/auth/email/link', {
      method: 'POST',
      body: { email: 'a@example.com' },
    });
    await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  it('сбой повтора — текст ошибки под адресом', async () => {
    const user = userEvent.setup();
    mockedApiFetch.mockRejectedValue(new Error('boom'));
    render(<PendingEmailNotice email="a@example.com" refresh={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Прислать ссылку ещё раз' }));

    expect(
      await screen.findByText(
        'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.',
      ),
    ).toBeInTheDocument();
  });
});
