// Форма «Нет Telegram? Войдите по почте» в изоляции (LoginScreen.test.tsx
// проверяет только то, что блок появляется/пропадает по emailLoginEnabled).
// EmailCodeForm внутри использует useAuth()/useNavigate() (ADR-0104) —
// оборачиваем в <AuthProvider>/<MemoryRouter>, тот же приём, что
// EmailCodeForm.test.tsx.
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EMAIL_LOGIN_RESEND_COOLDOWN_MIN } from '@xuanxue/shared';
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
  vi.useRealTimers();
});

const COOLDOWN_MS = EMAIL_LOGIN_RESEND_COOLDOWN_MIN * 60 * 1000;

/** Фальшивые часы для отсчёта cooldown (F30); userEvent двигает их сам,
 * иначе его внутренние задержки ждали бы вечно. */
function setupWithFakeTimers() {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  return userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
}

async function passCooldown(): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(COOLDOWN_MS);
  });
}

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

  // Аудит 2026-10-01, F30: в окне cooldown сервер отвечает тем же 204, не
  // отправляя письма, а после окна заменяет заявку — код из первого письма
  // перестаёт работать. Раньше ссылка была всегда и молчала.
  it('пока идёт cooldown — ссылки нет, виден отсчёт', async () => {
    const user = setupWithFakeTimers();
    mockRoutes((path) =>
      path === '/auth/email/request' ? Promise.resolve(undefined) : undefined,
    );
    renderForm();

    await user.type(await screen.findByLabelText('Почта'), 'a@example.com');
    await user.click(screen.getByRole('button', { name: 'Прислать код' }));
    await screen.findByText(/Письмо ушло/);

    expect(
      screen.queryByRole('button', { name: 'Отправить ещё раз' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/Новое письмо можно запросить через/)).toHaveTextContent(
      '2:00',
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    expect(screen.getByText(/Новое письмо можно запросить через/)).toHaveTextContent(
      '1:45',
    );
  });

  it('после cooldown «Отправить ещё раз» шлёт второй запрос с тем же адресом и предупреждает про прежний код', async () => {
    const user = setupWithFakeTimers();
    mockRoutes((path) =>
      path === '/auth/email/request' ? Promise.resolve(undefined) : undefined,
    );
    renderForm();

    await user.type(await screen.findByLabelText('Почта'), 'a@example.com');
    await user.click(screen.getByRole('button', { name: 'Прислать код' }));
    await screen.findByText(/Письмо ушло/);
    await passCooldown();

    expect(
      screen.getByText('Код из прежнего письма перестанет работать.'),
    ).toBeInTheDocument();
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
    // Повтор ушёл — окно закрылось снова.
    expect(
      screen.queryByRole('button', { name: 'Отправить ещё раз' }),
    ).not.toBeInTheDocument();
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
    const user = setupWithFakeTimers();
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
    await passCooldown();

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

// Отзыв ученицы 2026-11-06: ввела код — «откройте ссылку-приглашение»;
// отказ стоял строкой под живой формой кода, и двадцать минут она
// запрашивала новые письма и вводила код снова — в тот же 403. Теперь отказ
// занимает место формы, как у Telegram-входа (LoginRefusedNotice.tsx).
describe('EmailLoginForm — отказ 403 на коде из письма', () => {
  const NO_INVITE_MESSAGE =
    'Чтобы попасть в кабинет, откройте ссылку-приглашение от учителя школы.';

  async function sendAndEnterCode(
    refusal: string,
  ): Promise<ReturnType<typeof userEvent.setup>> {
    const user = userEvent.setup();
    mockRoutes((path) => {
      if (path === '/auth/email/request') return Promise.resolve(undefined);
      if (path === '/auth/email/code')
        return Promise.reject(new ApiError(refusal, 403, 'forbidden'));
      return undefined;
    });
    renderForm();
    await user.type(await screen.findByLabelText('Почта'), 'a@example.com');
    await user.click(screen.getByRole('button', { name: 'Прислать код' }));
    await user.type(await screen.findByLabelText('Код из письма'), '123456');
    await user.click(screen.getByRole('button', { name: 'Войти' }));
    return user;
  }

  it('нет ссылки-приглашения — объяснение вместо формы: ни поля кода, ни «Отправить ещё раз»', async () => {
    await sendAndEnterCode(NO_INVITE_MESSAGE);

    expect(await screen.findByText('Войти не получилось')).toBeInTheDocument();
    expect(screen.getByText(NO_INVITE_MESSAGE)).toBeInTheDocument();
    // Ссылку искали в письме с кодом — приписка говорит, что там её нет и у
    // кого она есть; акцент на «учитель школы» (ADR-0124).
    expect(screen.getByText(/В письме с кодом её нет/)).toHaveTextContent(
      'В письме с кодом её нет: ссылку-приглашение присылает учитель школы. ' +
        'Попросите её у учителя и войдите по ней ещё раз.',
    );
    expect(screen.getByText('учитель школы').tagName).toBe('STRONG');
    expect(screen.queryByLabelText('Код из письма')).not.toBeInTheDocument();
    expect(screen.queryByText(/Письмо ушло/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Отправить ещё раз' }),
    ).not.toBeInTheDocument();
  });

  it('доступ закрыт (ACCESS_MESSAGE) — то же объяснение, но без приписки про ссылку', async () => {
    await sendAndEnterCode('Доступа нет. Обратитесь к администратору школы.');

    expect(await screen.findByText('Войти не получилось')).toBeInTheDocument();
    expect(
      screen.getByText('Доступа нет. Обратитесь к администратору школы.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/ссылку-приглашение/)).not.toBeInTheDocument();
  });

  it('«Войти другим способом» возвращает форму кода — адрес мог быть не тот', async () => {
    const user = await sendAndEnterCode(NO_INVITE_MESSAGE);
    await screen.findByText('Войти не получилось');

    await user.click(screen.getByRole('button', { name: 'Войти другим способом' }));

    expect(screen.queryByText('Войти не получилось')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Код из письма')).toBeInTheDocument();
  });
});
