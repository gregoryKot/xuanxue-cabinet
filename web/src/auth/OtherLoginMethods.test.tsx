// Условие видимости Google/почты в одном месте (LoginScreen.tsx и
// JoinScreen.tsx только рендерят этот компонент) — тест на сам компонент, не
// на оба экрана по отдельности.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuthConfigDto } from '@xuanxue/shared';
import { OtherLoginMethods } from './OtherLoginMethods';

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderWith(
  config: AuthConfigDto | null,
  configStatus: 'loading' | 'ok' | 'offline',
  inviteCode?: string,
) {
  return render(
    <MemoryRouter>
      <OtherLoginMethods
        config={config}
        configStatus={configStatus}
        inviteCode={inviteCode}
      />
    </MemoryRouter>,
  );
}

const BASE_CONFIG: AuthConfigDto = {
  emailLoginEnabled: false,
  fileStorageEnabled: false,
  googleLoginEnabled: false,
  telegramOidcEnabled: false,
};

describe('OtherLoginMethods', () => {
  it('configStatus не ok — ничего не рисует, пока не известно, что настроено', () => {
    renderWith(null, 'loading');
    expect(
      screen.queryByRole('button', { name: 'Войти через Google' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Почта')).not.toBeInTheDocument();
  });

  it('googleLoginEnabled: false — кнопки Google нет', () => {
    renderWith({ ...BASE_CONFIG, googleLoginEnabled: false }, 'ok');
    expect(
      screen.queryByRole('button', { name: 'Войти через Google' }),
    ).not.toBeInTheDocument();
  });

  it('googleLoginEnabled: true — кнопка Google есть', () => {
    renderWith({ ...BASE_CONFIG, googleLoginEnabled: true }, 'ok');
    expect(
      screen.getByRole('button', { name: 'Войти через Google' }),
    ).toBeInTheDocument();
  });

  it('оба флага включены — кнопка Google стоит раньше формы почты в разметке', () => {
    const { container } = renderWith(
      { ...BASE_CONFIG, googleLoginEnabled: true, emailLoginEnabled: true },
      'ok',
    );

    const text = container.textContent ?? '';
    const googlePosition = text.indexOf('Войти через Google');
    const emailPosition = text.indexOf('или по почте');

    expect(googlePosition).toBeGreaterThanOrEqual(0);
    expect(emailPosition).toBeGreaterThan(googlePosition);
  });

  it('код приглашения доходит до кнопки Google (join в query редиректа)', async () => {
    const user = userEvent.setup();
    const assign = vi.fn();
    vi.stubGlobal('location', { assign });
    const code = 'a'.repeat(32);

    renderWith({ ...BASE_CONFIG, googleLoginEnabled: true }, 'ok', code);
    await user.click(screen.getByRole('button', { name: 'Войти через Google' }));

    expect(assign).toHaveBeenCalledWith(`/api/auth/google/start?join=${code}`);
  });

  it('код приглашения доходит до формы почты — поле не пустой заглушкой (EmailLoginForm.test.tsx проверяет сам запрос)', () => {
    renderWith({ ...BASE_CONFIG, emailLoginEnabled: true }, 'ok', 'a'.repeat(32));
    expect(screen.getByLabelText('Почта')).toBeInTheDocument();
  });
});

// Отзыв владельца 2026-11-06: человек, вводя почту на странице входа, думал,
// что так регистрируется, — а письмо с кодом уходит на любой адрес, и отказ
// без ссылки-приглашения приходит только после кода.
describe('OtherLoginMethods — для кого форма почты', () => {
  const HINT_TEXT =
    'По почте входят те, кто уже в кабинете. Первый раз — только по ' +
    'ссылке-приглашению от учителя школы: без неё код из письма не впустит.';

  it('без кода приглашения (страница входа) — над полем почты сказано, что регистрация только по ссылке', () => {
    renderWith({ ...BASE_CONFIG, emailLoginEnabled: true }, 'ok');

    // ADR-0124: кто даёт ссылку — акцентом, RichText рисует его <strong>.
    expect(screen.getByText(/По почте входят/)).toHaveTextContent(HINT_TEXT);
    expect(screen.getByText('учителя школы').tagName).toBe('STRONG');
    expect(screen.getByLabelText('Почта')).toBeInTheDocument();
  });

  it('с кодом приглашения (страница /join) — подсказки нет: регистрация здесь и происходит', () => {
    renderWith({ ...BASE_CONFIG, emailLoginEnabled: true }, 'ok', 'a'.repeat(32));
    expect(screen.queryByText(/По почте входят/)).not.toBeInTheDocument();
  });

  it('почта выключена — подсказки нет вместе с формой', () => {
    renderWith({ ...BASE_CONFIG, emailLoginEnabled: false }, 'ok');
    expect(screen.queryByText(/По почте входят/)).not.toBeInTheDocument();
  });
});
