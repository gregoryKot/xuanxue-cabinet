// Экран первого входа (`/welcome`, ADR-0044). Отправка в изоляции —
// useProfileSetup.test.ts, здесь — начальные поля из me.name, доступность
// кнопки и то, что уже назвавшегося экран не держит (тот же приём проверки,
// что у EmailLoginCallbackScreen.test.tsx: настоящий MemoryRouter и стабы
// экранов назначения, без мока react-router-dom).
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NEW_PERSON_NAME, type MeDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { ApiError, apiFetch } from '../api/http';
import { AuthProvider } from '../auth/AuthProvider';
import { saveReturnTo } from '../auth/returnTo';
import WelcomeScreen from './WelcomeScreen';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

const mockedApiFetch = vi.mocked(apiFetch);

/** Не назвавшийся человек (ADR-0044): telegramLinked отличает вход через
 * Telegram (имя уже есть) от входа по почте (заглушка NEW_PERSON_NAME). */
function meNeedingProfile(name: string): MeDto {
  return {
    id: 'u1',
    name,
    roles: [],
    tz: 'Asia/Jerusalem',
    status: 'active',
    telegramLinked: name !== NEW_PERSON_NAME,
    botChatActive: false,
    needsProfile: true,
  };
}

afterEach(() => {
  mockedApiFetch.mockReset();
  sessionStorage.clear();
});

function renderScreen(me: MeDto) {
  mockedApiFetch.mockImplementation((path: string) => {
    if (path === '/auth/me') return Promise.resolve(me);
    return Promise.reject(new Error(`неожиданный путь в тесте: ${path}`));
  });

  return render(
    <MemoryRouter initialEntries={['/welcome']}>
      <AuthProvider>
        <Routes>
          <Route path="/welcome" element={<WelcomeScreen />} />
          <Route path="/" element={<p>Занятия</p>} />
          <Route path="/exams" element={<p>Экзамены</p>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('WelcomeScreen — начальные поля', () => {
  it('«Дмитрий Котов» (пришедший через Telegram) — поля заполнены именем и фамилией', async () => {
    renderScreen(meNeedingProfile('Дмитрий Котов'));

    expect(await screen.findByLabelText('Имя')).toHaveValue('Дмитрий');
    expect(screen.getByLabelText('Фамилия')).toHaveValue('Котов');
  });

  it('вошедший по почте (NEW_PERSON_NAME) — оба поля пустые', async () => {
    renderScreen(meNeedingProfile(NEW_PERSON_NAME));

    expect(await screen.findByLabelText('Имя')).toHaveValue('');
    expect(screen.getByLabelText('Фамилия')).toHaveValue('');
  });
});

describe('WelcomeScreen — кнопка «Продолжить»', () => {
  it('пустое имя — кнопка недоступна, запроса на сервер нет', async () => {
    renderScreen(meNeedingProfile(NEW_PERSON_NAME));

    expect(await screen.findByRole('button', { name: 'Продолжить' })).toBeDisabled();
    expect(mockedApiFetch).not.toHaveBeenCalledWith('/me/profile', expect.anything());
  });
});

describe('WelcomeScreen — отправка', () => {
  it('шлёт PATCH /me/profile с обрезанными значениями, затем refresh() и переход на сохранённый адрес', async () => {
    const user = userEvent.setup();
    saveReturnTo('/exams');
    const me = meNeedingProfile(NEW_PERSON_NAME);
    mockedApiFetch.mockImplementation((path: string, init?: { method?: string }) => {
      if (path === '/auth/me') return Promise.resolve(me);
      if (path === '/me/profile' && init?.method === 'PATCH') {
        return Promise.resolve(undefined);
      }
      return Promise.reject(new Error(`неожиданный путь в тесте: ${path}`));
    });
    render(
      <MemoryRouter initialEntries={['/welcome']}>
        <AuthProvider>
          <Routes>
            <Route path="/welcome" element={<WelcomeScreen />} />
            <Route path="/exams" element={<p>Экзамены</p>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );

    await user.type(await screen.findByLabelText('Имя'), '  Мария  ');
    await user.type(screen.getByLabelText('Фамилия'), '  Ли  ');
    await user.click(screen.getByRole('button', { name: 'Продолжить' }));

    expect(await screen.findByText('Экзамены')).toBeInTheDocument();
    expect(mockedApiFetch).toHaveBeenCalledWith('/me/profile', {
      method: 'PATCH',
      body: { firstName: 'Мария', lastName: 'Ли' },
    });
    // refresh() зовёт /auth/me второй раз (первый — при монтировании) —
    // подтверждает, что сессия обновилась перед переходом, не только тело PATCH.
    const meCalls = mockedApiFetch.mock.calls.filter(([path]) => path === '/auth/me');
    expect(meCalls.length).toBeGreaterThanOrEqual(2);
  });

  it('ошибка сервера — сообщение показывается, поля сохраняются, повтор работает', async () => {
    const user = userEvent.setup();
    const me = meNeedingProfile('Дмитрий Котов');
    let patchAttempt = 0;
    mockedApiFetch.mockImplementation((path: string, init?: { method?: string }) => {
      if (path === '/auth/me') return Promise.resolve(me);
      if (path === '/me/profile' && init?.method === 'PATCH') {
        patchAttempt += 1;
        return patchAttempt === 1
          ? Promise.reject(
              new ApiError('Сервер не ответил. Попробуйте ещё раз.', 500, 'unknown'),
            )
          : Promise.resolve(undefined);
      }
      return Promise.reject(new Error(`неожиданный путь в тесте: ${path}`));
    });
    render(
      <MemoryRouter initialEntries={['/welcome']}>
        <AuthProvider>
          <Routes>
            <Route path="/welcome" element={<WelcomeScreen />} />
            <Route path="/" element={<p>Занятия</p>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );

    await user.click(await screen.findByRole('button', { name: 'Продолжить' }));

    expect(
      await screen.findByText('Сервер не ответил. Попробуйте ещё раз.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Имя')).toHaveValue('Дмитрий');
    expect(screen.getByLabelText('Фамилия')).toHaveValue('Котов');

    await user.click(screen.getByRole('button', { name: 'Продолжить' }));

    expect(await screen.findByText('Занятия')).toBeInTheDocument();
  });
});

describe('WelcomeScreen — уже назвался', () => {
  it('needsProfile: false — уводит на домашний экран сразу, без формы и без запроса PATCH', async () => {
    renderScreen({ ...meNeedingProfile('Дмитрий Котов'), needsProfile: false });

    expect(await screen.findByText('Занятия')).toBeInTheDocument();
    expect(screen.queryByText('Как вас зовут?')).not.toBeInTheDocument();
    expect(mockedApiFetch).not.toHaveBeenCalledWith('/me/profile', expect.anything());
  });
});
