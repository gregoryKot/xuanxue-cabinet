// Форма «Нет Telegram? Войдите по почте» в изоляции (LoginScreen.test.tsx
// проверяет только то, что блок появляется/пропадает по emailLoginEnabled).
// EmailCodeForm внутри использует useAuth()/useNavigate() (ADR-0104) —
// оборачиваем в <AuthProvider>/<MemoryRouter>, тот же приём, что
// EmailCodeForm.test.tsx.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as HttpModule from '../api/http';
import { ApiError, apiFetch } from '../api/http';
import { AuthProvider } from './AuthProvider';
import { EmailLoginForm } from './EmailLoginForm';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

const mockedApiFetch = vi.mocked(apiFetch);

/** AuthProvider на монтировании сам зовёт GET /auth/me — здесь всегда гость
 * (401), остальные пути подставляет каждый тест поверх (тот же приём, что
 * LoginScreen.test.tsx). */
function mockRoutes(extra: (path: string) => Promise<unknown> | undefined) {
  mockedApiFetch.mockImplementation((path: string) => {
    const result = extra(path);
    if (result) return result;
    if (path === '/auth/me')
      return Promise.reject(new ApiError('Войдите', 401, 'unauthorized'));
    return Promise.reject(new Error(`неожиданный путь в тесте: ${path}`));
  });
}

function renderForm(props: { inviteCode?: string } = {}) {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <EmailLoginForm {...props} />
      </AuthProvider>
    </MemoryRouter>,
  );
}

afterEach(() => {
  mockedApiFetch.mockReset();
});

describe('EmailLoginForm', () => {
  it('пустое поле — кнопка недоступна', async () => {
    mockRoutes(() => undefined);
    renderForm();
    expect(await screen.findByRole('button', { name: 'Прислать код' })).toBeDisabled();
  });

  // Отзыв владельца 2026-09-22 на первую версию экрана: кнопка и абзац
  // «письмо ушло» обещали одну ссылку, а на айфоне работает как раз код.
  // Регресс вернулся бы молча — про тексты входа больше не догадываются.
  it('до отправки кнопка называет код', async () => {
    mockRoutes(() => undefined);
    renderForm();

    expect(
      await screen.findByRole('button', { name: 'Прислать код' }),
    ).toBeInTheDocument();
  });

  it('после отправки абзац ведёт к коду, а не к ссылке', async () => {
    const user = userEvent.setup();
    mockRoutes((path) =>
      path === '/auth/email/request' ? Promise.resolve(undefined) : undefined,
    );
    renderForm();

    await user.type(await screen.findByLabelText('Почта'), 'a@example.com');
    await user.click(screen.getByRole('button', { name: 'Прислать код' }));

    expect(await screen.findByText(/Введите код из него/)).toBeInTheDocument();
  });

  it('inviteCode (ADR-0030) — уходит в теле запроса вместе с email', async () => {
    const user = userEvent.setup();
    mockRoutes((path) =>
      path === '/auth/email/request' ? Promise.resolve(undefined) : undefined,
    );
    renderForm({ inviteCode: 'a'.repeat(32) });

    await user.type(await screen.findByLabelText('Почта'), 'a@example.com');
    await user.click(screen.getByRole('button', { name: 'Прислать код' }));

    await screen.findByText(/Письмо ушло/);
    expect(mockedApiFetch).toHaveBeenCalledWith('/auth/email/request', {
      method: 'POST',
      body: { email: 'a@example.com', inviteCode: 'a'.repeat(32) },
    });
  });

  it('успех — «Письмо ушло на …», форма пропадает, поле кода на месте', async () => {
    const user = userEvent.setup();
    mockRoutes((path) =>
      path === '/auth/email/request' ? Promise.resolve(undefined) : undefined,
    );
    renderForm();

    await user.type(await screen.findByLabelText('Почта'), 'a@example.com');
    await user.click(screen.getByRole('button', { name: 'Прислать код' }));

    expect(await screen.findByText(/Письмо ушло на a@example\.com/)).toBeInTheDocument();
    expect(screen.getByLabelText('Код из письма')).toBeInTheDocument();
    // Адрес уже известен из письма — второй раз его не спрашивают.
    expect(screen.queryByLabelText('Почта')).not.toBeInTheDocument();
  });

  it('«Отправить ещё раз» шлёт второй запрос с тем же адресом, экран не возвращается к форме', async () => {
    const user = userEvent.setup();
    mockRoutes((path) =>
      path === '/auth/email/request' ? Promise.resolve(undefined) : undefined,
    );
    renderForm();

    await user.type(await screen.findByLabelText('Почта'), 'a@example.com');
    await user.click(screen.getByRole('button', { name: 'Прислать код' }));
    await screen.findByText(/Письмо ушло/);

    await user.click(screen.getByRole('button', { name: 'Отправить ещё раз' }));

    // Фильтр по пути (не toHaveBeenCalledTimes): AuthProvider на монтировании
    // сам зовёт GET /auth/me, это не имеет отношения к повтору отправки.
    const requestCalls = mockedApiFetch.mock.calls.filter(
      ([path]) => path === '/auth/email/request',
    );
    expect(requestCalls).toHaveLength(2);
    expect(mockedApiFetch).toHaveBeenLastCalledWith('/auth/email/request', {
      method: 'POST',
      body: { email: 'a@example.com' },
    });
    expect(await screen.findByText(/Письмо ушло/)).toBeInTheDocument();
  });

  it('ошибка до первого успеха — текст под полем, форма остаётся', async () => {
    const user = userEvent.setup();
    mockRoutes((path) =>
      path === '/auth/email/request'
        ? Promise.reject(
            new ApiError('Email-вход пока не подключён.', 503, 'not_available'),
          )
        : undefined,
    );
    renderForm();

    await user.type(await screen.findByLabelText('Почта'), 'a@example.com');
    await user.click(screen.getByRole('button', { name: 'Прислать код' }));

    expect(await screen.findByText('Email-вход пока не подключён.')).toBeInTheDocument();
    expect(screen.getByLabelText('Почта')).toBeInTheDocument();
  });

  it('сбой «Отправить ещё раз» — текст ошибки поверх экрана «отправлено», форма не возвращается', async () => {
    const user = userEvent.setup();
    let requestAttempt = 0;
    mockRoutes((path) => {
      if (path !== '/auth/email/request') return undefined;
      requestAttempt += 1;
      return requestAttempt === 1
        ? Promise.resolve(undefined)
        : Promise.reject(new Error('boom'));
    });
    renderForm();
    await user.type(await screen.findByLabelText('Почта'), 'a@example.com');
    await user.click(screen.getByRole('button', { name: 'Прислать код' }));
    await screen.findByText(/Письмо ушло/);

    await user.click(screen.getByRole('button', { name: 'Отправить ещё раз' }));

    expect(await screen.findByText(/Нет связи с сервером/)).toBeInTheDocument();
    expect(screen.getByText(/Письмо ушло/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Почта')).not.toBeInTheDocument();
  });
});

describe('EmailLoginForm — дверь в код из состояния покоя (ADR-0104)', () => {
  it('в покое есть «У меня уже есть код», она открывает форму с полем адреса', async () => {
    const user = userEvent.setup();
    mockRoutes(() => undefined);
    renderForm();

    await user.click(await screen.findByRole('button', { name: 'У меня уже есть код' }));

    expect(screen.getByLabelText('Почта')).toBeInTheDocument();
    expect(screen.getByLabelText('Код из письма')).toBeInTheDocument();
    // Форма отправки ссылки спрятана — сейчас на экране только код.
    expect(
      screen.queryByRole('button', { name: 'Прислать код' }),
    ).not.toBeInTheDocument();
  });

  it('«Назад» возвращает к форме почты', async () => {
    const user = userEvent.setup();
    mockRoutes(() => undefined);
    renderForm();

    await user.click(await screen.findByRole('button', { name: 'У меня уже есть код' }));
    await user.click(screen.getByRole('button', { name: 'Назад' }));

    expect(screen.getByRole('button', { name: 'Прислать код' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Код из письма')).not.toBeInTheDocument();
  });
});
