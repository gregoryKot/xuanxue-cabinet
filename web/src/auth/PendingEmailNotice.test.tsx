// В изоляции, как EmailLinkForm.test.tsx — apiFetch замокан, applyMe()
// обычный колбэк.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MeDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { apiFetch } from '../api/http';
import { PendingEmailNotice } from './PendingEmailNotice';

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

describe('PendingEmailNotice', () => {
  it('показывает адрес и объяснение, что делать', () => {
    render(
      <PendingEmailNotice
        email="a@example.com"
        applyMe={vi.fn()}
        onChangeAddress={vi.fn()}
      />,
    );

    expect(screen.getByText(/Мы отправили ссылку на a@example\.com/)).toBeInTheDocument();
  });

  it('«Прислать ссылку ещё раз» шлёт POST /auth/email/link с тем же адресом', async () => {
    const user = userEvent.setup();
    mockedApiFetch.mockResolvedValue(ME);
    const applyMe = vi.fn();
    render(
      <PendingEmailNotice
        email="a@example.com"
        applyMe={applyMe}
        onChangeAddress={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Прислать ссылку ещё раз' }));

    expect(mockedApiFetch).toHaveBeenCalledWith('/auth/email/link', {
      method: 'POST',
      body: { email: 'a@example.com' },
    });
    await vi.waitFor(() => expect(applyMe).toHaveBeenCalledWith(ME));
  });

  it('сбой повтора — текст ошибки под адресом', async () => {
    const user = userEvent.setup();
    mockedApiFetch.mockRejectedValue(new Error('boom'));
    render(
      <PendingEmailNotice
        email="a@example.com"
        applyMe={vi.fn()}
        onChangeAddress={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Прислать ссылку ещё раз' }));

    expect(
      await screen.findByText(
        'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.',
      ),
    ).toBeInTheDocument();
  });

  it('«Указать другой адрес» зовёт onChangeAddress', async () => {
    const user = userEvent.setup();
    const onChangeAddress = vi.fn();
    render(
      <PendingEmailNotice
        email="a@example.com"
        applyMe={vi.fn()}
        onChangeAddress={onChangeAddress}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Указать другой адрес' }));

    expect(onChangeAddress).toHaveBeenCalledTimes(1);
  });
});
