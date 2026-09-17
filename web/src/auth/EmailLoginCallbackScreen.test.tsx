// Экран ссылки из письма (`/login/email?token=…`, ADR-0029). Токен тратится
// по нажатию «Войти», не при открытии страницы (SECURITY §2) — тесты ниже
// проверяют, что POST /auth/email/verify не уходит сам при рендере.
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MeDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { ApiError, apiFetch } from '../api/http';
import { AuthProvider } from './AuthProvider';
import EmailLoginCallbackScreen from './EmailLoginCallbackScreen';
import { saveReturnTo } from './returnTo';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

const mockedApiFetch = vi.mocked(apiFetch);
const VALID_TOKEN = 'a'.repeat(64);

const ME: MeDto = {
  id: 'u1',
  name: 'Ученик',
  roles: [],
  tz: 'Asia/Jerusalem',
  status: 'active',
  telegramLinked: false,
};

function mockMe(result: 'guest' | 'ok' = 'guest') {
  mockedApiFetch.mockImplementation((path: string) => {
    if (path === '/auth/me') {
      return result === 'ok'
        ? Promise.resolve(ME)
        : Promise.reject(new ApiError('Войдите', 401, 'unauthorized'));
    }
    return Promise.reject(new Error(`неожиданный путь в тесте: ${path}`));
  });
}

afterEach(() => {
  mockedApiFetch.mockReset();
  sessionStorage.clear();
});

function renderScreen(search: string) {
  return render(
    <MemoryRouter initialEntries={[`/login/email${search}`]}>
      <AuthProvider>
        <Routes>
          <Route path="/login/email" element={<EmailLoginCallbackScreen />} />
          <Route path="/login" element={<p>Экран входа</p>} />
          <Route path="/schedule" element={<p>Расписание</p>} />
          <Route path="/" element={<p>Занятия</p>} />
          <Route path="/exams" element={<p>Экзамены</p>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('EmailLoginCallbackScreen — битая ссылка', () => {
  it('нет токена — «Ссылка неполная», кнопка ведёт на /login', async () => {
    const user = userEvent.setup();
    mockMe('guest');
    renderScreen('');

    expect(
      await screen.findByText('Ссылка неполная. Запросите новую на странице входа.'),
    ).toBeInTheDocument();
    expect(mockedApiFetch).not.toHaveBeenCalledWith(
      '/auth/email/verify',
      expect.anything(),
    );

    await user.click(screen.getByRole('button', { name: 'На страницу входа' }));
    expect(await screen.findByText('Экран входа')).toBeInTheDocument();
  });

  it('токен не 64 hex — «Ссылка неполная», как без токена вовсе', async () => {
    mockMe('guest');
    renderScreen('?token=коротко');

    expect(
      await screen.findByText('Ссылка неполная. Запросите новую на странице входа.'),
    ).toBeInTheDocument();
  });
});

describe('EmailLoginCallbackScreen — валидный токен', () => {
  it('карточка «Подтвердите вход» — verify не уходит до клика', async () => {
    mockMe('guest');
    renderScreen(`?token=${VALID_TOKEN}`);

    expect(await screen.findByText('Подтвердите вход')).toBeInTheDocument();
    expect(mockedApiFetch).not.toHaveBeenCalledWith(
      '/auth/email/verify',
      expect.anything(),
    );
  });

  it('клик «Войти», нет returnTo — POST /auth/email/verify, refresh, переход на домашний экран', async () => {
    const user = userEvent.setup();
    mockedApiFetch.mockImplementation((path: string) => {
      if (path === '/auth/me')
        return Promise.reject(new ApiError('Войдите', 401, 'unauthorized'));
      if (path === '/auth/email/verify') return Promise.resolve(ME);
      return Promise.reject(new Error(`неожиданный путь в тесте: ${path}`));
    });
    renderScreen(`?token=${VALID_TOKEN}`);

    await user.click(await screen.findByRole('button', { name: 'Войти' }));

    expect(await screen.findByText('Занятия')).toBeInTheDocument();
    expect(mockedApiFetch).toHaveBeenCalledWith(
      '/auth/email/verify',
      expect.objectContaining({ method: 'POST', body: { token: VALID_TOKEN } }),
    );
  });

  it('клик «Войти», сохранён returnTo /exams (аудит L2) — переход туда', async () => {
    saveReturnTo('/exams');
    const user = userEvent.setup();
    mockedApiFetch.mockImplementation((path: string) => {
      if (path === '/auth/me')
        return Promise.reject(new ApiError('Войдите', 401, 'unauthorized'));
      if (path === '/auth/email/verify') return Promise.resolve(ME);
      return Promise.reject(new Error(`неожиданный путь в тесте: ${path}`));
    });
    renderScreen(`?token=${VALID_TOKEN}`);

    await user.click(await screen.findByRole('button', { name: 'Войти' }));

    expect(await screen.findByText('Экзамены')).toBeInTheDocument();
  });

  it('401 от сервера — текст с сервера, кнопка «Запросить новую» ведёт на /login', async () => {
    const user = userEvent.setup();
    mockedApiFetch.mockImplementation((path: string) => {
      if (path === '/auth/me')
        return Promise.reject(new ApiError('Войдите', 401, 'unauthorized'));
      if (path === '/auth/email/verify')
        return Promise.reject(
          new ApiError(
            'Ссылка устарела или уже использована. Запросите новую на странице входа.',
            401,
            'unauthorized',
          ),
        );
      return Promise.reject(new Error(`неожиданный путь в тесте: ${path}`));
    });
    renderScreen(`?token=${VALID_TOKEN}`);

    await user.click(await screen.findByRole('button', { name: 'Войти' }));

    expect(
      await screen.findByText(
        'Ссылка устарела или уже использована. Запросите новую на странице входа.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText('Расписание')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Запросить новую' }));
    await waitFor(() => expect(screen.getByText('Экран входа')).toBeInTheDocument());
  });
});

describe('EmailLoginCallbackScreen — join (ADR-0030/0034)', () => {
  const CODE = 'a'.repeat(32);

  it('join в query — inviteCode едет прямо в теле POST /auth/email/verify, без второго запроса', async () => {
    const user = userEvent.setup();
    mockedApiFetch.mockImplementation((path: string) => {
      if (path === '/auth/me')
        return Promise.reject(new ApiError('Войдите', 401, 'unauthorized'));
      if (path === '/auth/email/verify') return Promise.resolve(ME);
      return Promise.reject(new Error(`неожиданный путь в тесте: ${path}`));
    });
    renderScreen(`?token=${VALID_TOKEN}&join=${CODE}`);

    await user.click(await screen.findByRole('button', { name: 'Войти' }));

    expect(await screen.findByText('Занятия')).toBeInTheDocument();
    expect(mockedApiFetch).toHaveBeenCalledWith('/auth/email/verify', {
      method: 'POST',
      body: { token: VALID_TOKEN, inviteCode: CODE },
    });
    expect(mockedApiFetch).not.toHaveBeenCalledWith('/auth/join', expect.anything());
  });

  // Задача 4: 403 — новое письмо не поможет (нет ссылки-приглашения, чтобы
  // подтвердить нового человека), кнопка «Запросить новую» водила бы в ту же
  // петлю (открыл письмо → снова 403). Вместо кнопки — приписка с действием.
  it('403 без ссылки-приглашения (новый человек без кода) — текст сервера, приписка вместо «Запросить новую»', async () => {
    const user = userEvent.setup();
    mockedApiFetch.mockImplementation((path: string) => {
      if (path === '/auth/me')
        return Promise.reject(new ApiError('Войдите', 401, 'unauthorized'));
      if (path === '/auth/email/verify')
        return Promise.reject(
          new ApiError(
            'Чтобы попасть в кабинет, откройте ссылку-приглашение от учителя школы.',
            403,
            'forbidden',
          ),
        );
      return Promise.reject(new Error(`неожиданный путь в тесте: ${path}`));
    });
    renderScreen(`?token=${VALID_TOKEN}`);

    await user.click(await screen.findByRole('button', { name: 'Войти' }));

    expect(
      await screen.findByText(
        'Чтобы попасть в кабинет, откройте ссылку-приглашение от учителя школы.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Ссылку-приглашение вам даст учитель школы. Откройте её и войдите ещё раз.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Запросить новую' }),
    ).not.toBeInTheDocument();
  });
});

describe('EmailLoginCallbackScreen — уже вошедшего уводит на сохранённый адрес или домашний (аудит L2)', () => {
  it('authStatus ok, нет returnTo — редирект на домашний экран, карточка не показывается', async () => {
    mockMe('ok');
    renderScreen(`?token=${VALID_TOKEN}`);

    expect(await screen.findByText('Занятия')).toBeInTheDocument();
    expect(screen.queryByText('Подтвердите вход')).not.toBeInTheDocument();
  });

  it('authStatus ok, есть returnTo /exams — редирект туда', async () => {
    saveReturnTo('/exams');
    mockMe('ok');
    renderScreen(`?token=${VALID_TOKEN}`);

    expect(await screen.findByText('Экзамены')).toBeInTheDocument();
  });
});
