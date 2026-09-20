// Страница подтверждения почты (`/email/confirm?token=…`, ADR-0059). Токен
// тратится сам, из JS, при открытии — тесты проверяют, что
// POST /auth/email/confirm уходит без кликов ровно один раз, а для «ссылка не
// подошла» его не было вовсе. Экран не требует сессии — в отличие от
// EmailLoginCallbackScreen.test.tsx, <AuthProvider> здесь не нужен.
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EMAIL_CONFIRM_EXPIRED_MESSAGE } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { ApiError, apiFetch } from '../api/http';
import EmailConfirmScreen from './EmailConfirmScreen';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

const mockedApiFetch = vi.mocked(apiFetch);
const VALID_TOKEN = 'a'.repeat(64);

function confirmCalls() {
  return mockedApiFetch.mock.calls.filter(([path]) => path === '/auth/email/confirm');
}

afterEach(() => {
  mockedApiFetch.mockReset();
});

function renderScreen(search: string) {
  return render(
    <MemoryRouter initialEntries={[`/email/confirm${search}`]}>
      <Routes>
        <Route path="/email/confirm" element={<EmailConfirmScreen />} />
        <Route path="/" element={<p>Занятия</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('EmailConfirmScreen — неполная ссылка (запрос не уходит вовсе)', () => {
  it('нет токена — «Ссылка не подошла», кнопка ведёт на «/»', async () => {
    const user = userEvent.setup();
    renderScreen('');

    expect(await screen.findByText('Ссылка не подошла')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Ссылка неполная. Откройте «Профиль» в кабинете и пришлите её ещё раз.',
      ),
    ).toBeInTheDocument();
    expect(confirmCalls()).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: 'Открыть кабинет' }));
    expect(await screen.findByText('Занятия')).toBeInTheDocument();
  });

  it('токен не 64 hex — тоже «Ссылка не подошла», запрос не уходит', async () => {
    renderScreen('?token=коротко');

    expect(await screen.findByText('Ссылка не подошла')).toBeInTheDocument();
    expect(confirmCalls()).toHaveLength(0);
  });
});

describe('EmailConfirmScreen — валидный токен, подтверждение само, без кликов', () => {
  it('пока идёт запрос — заголовок и скелетон, без кнопки «Подтвердить»', async () => {
    let resolveConfirm: () => void = () => {};
    mockedApiFetch.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveConfirm = resolve;
        }),
    );
    const { container } = renderScreen(`?token=${VALID_TOKEN}`);

    expect(await screen.findByText('Подтверждаем адрес')).toBeInTheDocument();
    await waitFor(() => expect(confirmCalls()).toHaveLength(1));
    expect(container.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Подтвердить' })).not.toBeInTheDocument();

    resolveConfirm();
    await waitFor(() =>
      expect(screen.getByText('Адрес подтверждён')).toBeInTheDocument(),
    );
  });

  it('успех — «Адрес подтверждён», «Открыть кабинет» ведёт на «/», запрос ушёл ровно один раз', async () => {
    const user = userEvent.setup();
    mockedApiFetch.mockResolvedValue(undefined);
    renderScreen(`?token=${VALID_TOKEN}`);

    expect(await screen.findByText('Адрес подтверждён')).toBeInTheDocument();
    expect(
      screen.getByText(/Теперь можно входить в кабинет и по почте/),
    ).toBeInTheDocument();
    expect(confirmCalls()).toHaveLength(1);
    expect(confirmCalls()[0]?.[1]).toEqual({
      method: 'POST',
      body: { token: VALID_TOKEN },
    });

    await user.click(screen.getByRole('button', { name: 'Открыть кабинет' }));
    expect(await screen.findByText('Занятия')).toBeInTheDocument();
  });

  it('401 от сервера (ссылка устарела) — текст сервера, кнопка «Открыть кабинет», повтора не было', async () => {
    const user = userEvent.setup();
    mockedApiFetch.mockRejectedValue(
      new ApiError(EMAIL_CONFIRM_EXPIRED_MESSAGE, 401, 'unauthorized'),
    );
    renderScreen(`?token=${VALID_TOKEN}`);

    expect(await screen.findByText(EMAIL_CONFIRM_EXPIRED_MESSAGE)).toBeInTheDocument();
    expect(confirmCalls()).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'Открыть кабинет' }));
    expect(await screen.findByText('Занятия')).toBeInTheDocument();
    expect(confirmCalls()).toHaveLength(1);
  });

  it('409 (адрес уже занят) — текст сервера показан', async () => {
    mockedApiFetch.mockRejectedValue(
      new ApiError(
        'Этот адрес уже привязан к другому аккаунту кабинета.',
        409,
        'conflict',
      ),
    );
    renderScreen(`?token=${VALID_TOKEN}`);

    expect(
      await screen.findByText('Этот адрес уже привязан к другому аккаунту кабинета.'),
    ).toBeInTheDocument();
  });

  it('сетевой сбой (не ApiError) — общий текст, кнопка «Открыть кабинет»', async () => {
    mockedApiFetch.mockRejectedValue(new Error('boom'));
    renderScreen(`?token=${VALID_TOKEN}`);

    expect(
      await screen.findByText(
        'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Открыть кабинет' })).toBeInTheDocument();
  });
});
