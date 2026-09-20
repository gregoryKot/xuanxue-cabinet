// Экран ссылки из письма (`/login/email?token=…`, ADR-0044). Токен тратится
// сам, из JS, сразу при открытии страницы — тесты ниже проверяют, что
// POST /auth/email/verify уходит без кликов ровно один раз, и что для
// «ссылка неполная» и «уже вошедшего» его не было вовсе.
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
  status: 'active',
  telegramLinked: false,
  botChatActive: false,
  needsProfile: false,
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

/** `/auth/me` — гость, `/auth/email/verify` — успех (тело игнорируется, вход
 * подтверждает сам факт 2xx). Общий случай для «happy path» ниже. */
function mockGuestAndVerifySuccess() {
  mockedApiFetch.mockImplementation((path: string) => {
    if (path === '/auth/me')
      return Promise.reject(new ApiError('Войдите', 401, 'unauthorized'));
    if (path === '/auth/email/verify') return Promise.resolve(undefined);
    return Promise.reject(new Error(`неожиданный путь в тесте: ${path}`));
  });
}

function verifyCalls() {
  return mockedApiFetch.mock.calls.filter(([path]) => path === '/auth/email/verify');
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

describe('EmailLoginCallbackScreen — битая ссылка (verify не уходит вовсе)', () => {
  it('нет токена — «Ссылка неполная», кнопка ведёт на /login', async () => {
    const user = userEvent.setup();
    mockMe('guest');
    renderScreen('');

    expect(
      await screen.findByText('Ссылка неполная. Запросите новую на странице входа.'),
    ).toBeInTheDocument();
    expect(verifyCalls()).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: 'На страницу входа' }));
    expect(await screen.findByText('Экран входа')).toBeInTheDocument();
  });

  it('токен не 64 hex — «Ссылка неполная», как без токена вовсе, verify не уходит', async () => {
    mockMe('guest');
    renderScreen('?token=коротко');

    expect(
      await screen.findByText('Ссылка неполная. Запросите новую на странице входа.'),
    ).toBeInTheDocument();
    expect(verifyCalls()).toHaveLength(0);
  });
});

describe('EmailLoginCallbackScreen — валидный токен, вход сам, без кликов', () => {
  it('пока идёт запрос — заголовок «Входим в кабинет» и скелетон, кнопки «Войти» нет', async () => {
    let resolveVerify: () => void = () => {};
    mockedApiFetch.mockImplementation((path: string) => {
      if (path === '/auth/me')
        return Promise.reject(new ApiError('Войдите', 401, 'unauthorized'));
      if (path === '/auth/email/verify')
        return new Promise<void>((resolve) => {
          resolveVerify = resolve;
        });
      return Promise.reject(new Error(`неожиданный путь в тесте: ${path}`));
    });
    const { container } = renderScreen(`?token=${VALID_TOKEN}`);

    expect(await screen.findByText('Входим в кабинет')).toBeInTheDocument();
    // «Входим в кабинет» видно и пока /auth/me ещё грузится (до самого
    // verify) — ждём именно фактический POST, иначе resolveVerify() ниже
    // дёрнет ещё не переприсвоенную (старую no-op) функцию.
    await waitFor(() => expect(verifyCalls()).toHaveLength(1));
    expect(container.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Войти' })).not.toBeInTheDocument();
    expect(screen.queryByText('Подтвердите вход')).not.toBeInTheDocument();

    resolveVerify();
    await waitFor(() => expect(screen.getByText('Занятия')).toBeInTheDocument());
  });

  it('гость, нет returnTo — POST /auth/email/verify уходит сам, ровно один раз; после успеха refresh и переход на домашний экран', async () => {
    mockGuestAndVerifySuccess();
    renderScreen(`?token=${VALID_TOKEN}`);

    await waitFor(() => expect(screen.getByText('Занятия')).toBeInTheDocument());

    expect(verifyCalls()).toHaveLength(1);
    expect(verifyCalls()[0]?.[1]).toEqual(
      expect.objectContaining({ method: 'POST', body: { token: VALID_TOKEN } }),
    );
  });

  it('гость, сохранён returnTo /exams (аудит L2) — переход туда', async () => {
    saveReturnTo('/exams');
    mockGuestAndVerifySuccess();
    renderScreen(`?token=${VALID_TOKEN}`);

    await waitFor(() => expect(screen.getByText('Экзамены')).toBeInTheDocument());
    expect(verifyCalls()).toHaveLength(1);
  });

  it('401 от сервера — текст с сервера, кнопка «Запросить новую» ведёт на /login, повторного запроса не было', async () => {
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

    expect(
      await screen.findByText(
        'Ссылка устарела или уже использована. Запросите новую на странице входа.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText('Расписание')).not.toBeInTheDocument();
    expect(verifyCalls()).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'Запросить новую' }));
    await waitFor(() => expect(screen.getByText('Экран входа')).toBeInTheDocument());
    expect(verifyCalls()).toHaveLength(1);
  });

  it('сетевой сбой (не ApiError) — общий текст, кнопка «Запросить новую»', async () => {
    mockedApiFetch.mockImplementation((path: string) => {
      if (path === '/auth/me')
        return Promise.reject(new ApiError('Войдите', 401, 'unauthorized'));
      if (path === '/auth/email/verify') return Promise.reject(new Error('boom'));
      return Promise.reject(new Error(`неожиданный путь в тесте: ${path}`));
    });
    renderScreen(`?token=${VALID_TOKEN}`);

    expect(
      await screen.findByText(
        'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Запросить новую' })).toBeInTheDocument();
  });
});

describe('EmailLoginCallbackScreen — join (ADR-0030/0036)', () => {
  const CODE = 'a'.repeat(32);

  it('join в query — inviteCode едет прямо в теле POST /auth/email/verify, без кликов и без второго запроса', async () => {
    mockGuestAndVerifySuccess();
    renderScreen(`?token=${VALID_TOKEN}&join=${CODE}`);

    await waitFor(() => expect(screen.getByText('Занятия')).toBeInTheDocument());

    expect(verifyCalls()).toHaveLength(1);
    expect(verifyCalls()[0]?.[1]).toEqual({
      method: 'POST',
      body: { token: VALID_TOKEN, inviteCode: CODE },
    });
    expect(mockedApiFetch).not.toHaveBeenCalledWith('/auth/join', expect.anything());
  });

  // Задача 4: 403 — новое письмо не поможет (нет ссылки-приглашения, чтобы
  // подтвердить нового человека), кнопка «Запросить новую» водила бы в ту же
  // петлю (открыл письмо → снова 403). Вместо кнопки — приписка с действием.
  it('403 без ссылки-приглашения (новый человек без кода) — текст сервера, приписка вместо «Запросить новую»', async () => {
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
    expect(verifyCalls()).toHaveLength(1);
  });
});

describe('EmailLoginCallbackScreen — уже вошедшего уводит на сохранённый адрес или домашний, verify не уходит вовсе', () => {
  it('authStatus ok, нет returnTo — редирект на домашний экран, экран верификации не показывается', async () => {
    mockMe('ok');
    renderScreen(`?token=${VALID_TOKEN}`);

    expect(await screen.findByText('Занятия')).toBeInTheDocument();
    expect(screen.queryByText('Входим в кабинет')).not.toBeInTheDocument();
    expect(verifyCalls()).toHaveLength(0);
  });

  it('authStatus ok, есть returnTo /exams — редирект туда, verify не уходит', async () => {
    saveReturnTo('/exams');
    mockMe('ok');
    renderScreen(`?token=${VALID_TOKEN}`);

    expect(await screen.findByText('Экзамены')).toBeInTheDocument();
    expect(verifyCalls()).toHaveLength(0);
  });

  // Отзыв владельца (ADR-0044): пока AuthProvider не выяснил, есть ли уже
  // сессия, verify обязан ждать — иначе он ушёл бы тем же тиком, что и
  // проверка /auth/me, и сжёг бы токен, даже когда он был не нужен.
  it('пока /auth/me ещё не ответил — verify ждёт; как только выясняется «гость», уходит', async () => {
    let rejectMe: (err: unknown) => void = () => {};
    let meCallCount = 0;
    mockedApiFetch.mockImplementation((path: string) => {
      if (path === '/auth/me') {
        meCallCount += 1;
        // Только первый вызов управляется тестом (проверка сессии при
        // монтировании) — refresh() после успешного verify зовёт /auth/me
        // ещё раз, и этот повторный вызов не должен виснуть навечно.
        if (meCallCount === 1) {
          return new Promise((_resolve, reject) => {
            rejectMe = reject;
          });
        }
        return Promise.reject(new ApiError('Войдите', 401, 'unauthorized'));
      }
      if (path === '/auth/email/verify') return Promise.resolve(undefined);
      return Promise.reject(new Error(`неожиданный путь в тесте: ${path}`));
    });
    renderScreen(`?token=${VALID_TOKEN}`);

    expect(await screen.findByText('Входим в кабинет')).toBeInTheDocument();
    expect(verifyCalls()).toHaveLength(0);

    rejectMe(new ApiError('Войдите', 401, 'unauthorized'));

    await waitFor(() => expect(screen.getByText('Занятия')).toBeInTheDocument());
    expect(verifyCalls()).toHaveLength(1);
  });
});
