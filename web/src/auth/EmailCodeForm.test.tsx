// EmailCodeForm использует useAuth() (refresh) и useNavigate() внутри своей
// логики (useEmailCodeLogin.ts) — в отличие от EmailLinkForm.test.tsx (там
// applyMe передаётся колбэком), здесь нужны и <AuthProvider>, и
// <MemoryRouter> (тот же приём, что LoginScreen.test.tsx).
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as HttpModule from '../api/http';
import { ApiError, apiFetch } from '../api/http';
import { AuthProvider } from './AuthProvider';
import { EmailCodeForm } from './EmailCodeForm';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

const mockedApiFetch = vi.mocked(apiFetch);

/** AuthProvider на монтировании сам зовёт GET /auth/me (гость) — остальные
 * пути тест подставляет поверх. */
function mockRoutes(extra: (path: string) => Promise<unknown> | undefined) {
  mockedApiFetch.mockImplementation((path: string) => {
    const result = extra(path);
    if (result) return result;
    if (path === '/auth/me')
      return Promise.reject(new ApiError('Войдите', 401, 'unauthorized'));
    return Promise.reject(new Error(`неожиданный путь в тесте: ${path}`));
  });
}

function renderForm(props: Partial<Parameters<typeof EmailCodeForm>[0]> = {}) {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <EmailCodeForm email="a@example.com" {...props} />
      </AuthProvider>
    </MemoryRouter>,
  );
}

afterEach(() => {
  mockedApiFetch.mockReset();
});

describe('EmailCodeForm — кнопка «Войти»', () => {
  it('заперта, пока введено не шесть цифр', async () => {
    const user = userEvent.setup();
    mockRoutes(() => undefined);
    renderForm();

    const button = await screen.findByRole('button', { name: 'Войти' });
    expect(button).toBeDisabled();

    await user.type(screen.getByLabelText('Код из письма'), '12345');
    expect(button).toBeDisabled();

    await user.type(screen.getByLabelText('Код из письма'), '6');
    expect(button).toBeEnabled();
  });

  // Код из письма человек переносит выделением пальцем, и в буфер попадает
  // пробел или перевод строки; автоподстановка iOS добавляет своё. Раньше
  // такой ввод упирался в maxLength и запертую кнопку без объяснений.
  it('пробелы и буквы из вставленного кода отбрасываются', async () => {
    const user = userEvent.setup();
    mockRoutes(() => undefined);
    renderForm();

    const field = await screen.findByLabelText('Код из письма');
    await user.click(field);
    await user.paste(' 123 456 ');

    expect(field).toHaveValue('123456');
    expect(screen.getByRole('button', { name: 'Войти' })).toBeEnabled();
  });
});

describe('EmailCodeForm — поле адреса', () => {
  it('без onEmailChange поле «Почта» не показывается', async () => {
    mockRoutes(() => undefined);
    renderForm();

    await screen.findByLabelText('Код из письма');
    expect(screen.queryByLabelText('Почта')).not.toBeInTheDocument();
  });

  it('с onEmailChange поле «Почта» показывается и кнопка ждёт непустой адрес', async () => {
    const user = userEvent.setup();
    mockRoutes(() => undefined);
    renderForm({ email: '', onEmailChange: vi.fn() });

    await screen.findByLabelText('Почта');
    const button = screen.getByRole('button', { name: 'Войти' });

    await user.type(screen.getByLabelText('Код из письма'), '123456');
    expect(button).toBeDisabled(); // адрес пуст — кнопка всё равно заперта
  });
});

describe('EmailCodeForm — отправка', () => {
  it('уходит с введёнными адресом и кодом', async () => {
    const user = userEvent.setup();
    mockRoutes((path) =>
      path === '/auth/email/code' ? Promise.resolve(undefined) : undefined,
    );
    renderForm();

    await user.type(await screen.findByLabelText('Код из письма'), '123456');
    await user.click(screen.getByRole('button', { name: 'Войти' }));

    expect(mockedApiFetch).toHaveBeenCalledWith('/auth/email/code', {
      method: 'POST',
      body: { email: 'a@example.com', code: '123456' },
    });
  });

  it('ошибка сервера видна на экране', async () => {
    const user = userEvent.setup();
    mockRoutes((path) =>
      path === '/auth/email/code'
        ? Promise.reject(
            new ApiError(
              'Код не подошёл. Сверьте цифры с письмом или запросите новое.',
              401,
              'unauthorized',
            ),
          )
        : undefined,
    );
    renderForm();

    await user.type(await screen.findByLabelText('Код из письма'), '000000');
    await user.click(screen.getByRole('button', { name: 'Войти' }));

    expect(
      await screen.findByText(
        'Код не подошёл. Сверьте цифры с письмом или запросите новое.',
      ),
    ).toBeInTheDocument();
  });
});
