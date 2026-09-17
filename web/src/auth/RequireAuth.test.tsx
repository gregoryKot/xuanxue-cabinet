import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MeDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { apiFetch, ApiError } from '../api/http';
import { AuthProvider } from './AuthProvider';
import { RequireAuth } from './RequireAuth';
import { consumeReturnTo } from './returnTo';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

const mockedApiFetch = vi.mocked(apiFetch);

afterEach(() => {
  mockedApiFetch.mockReset();
  sessionStorage.clear();
});

function renderGuarded(initialEntry = '/schedule') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<p>Экран входа</p>} />
          <Route element={<RequireAuth />}>
            <Route path="/schedule" element={<p>Расписание</p>} />
            <Route path="/exams" element={<p>Экзамены</p>} />
          </Route>
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('RequireAuth', () => {
  it('гость (401) — редирект на /login', async () => {
    mockedApiFetch.mockRejectedValue(new Error('нет сессии'));

    renderGuarded();

    expect(await screen.findByText('Экран входа')).toBeInTheDocument();
  });

  it('сетевой сбой — «Нет связи…» с кнопкой «Повторить», не редирект', async () => {
    mockedApiFetch.mockRejectedValue(new ApiError('Нет связи', 0, 'network'));

    renderGuarded();

    expect(await screen.findByRole('alert')).toHaveTextContent('Нет связи с сервером');
    expect(screen.queryByText('Экран входа')).not.toBeInTheDocument();
  });

  it('вошедший (любая роль) — рендерит вложенный маршрут', async () => {
    const me: MeDto = {
      id: 'u1',
      name: 'Дима',
      roles: ['teacher'],
      tz: 'Asia/Jerusalem',
      status: 'active',
      telegramLinked: false,
    };
    mockedApiFetch.mockResolvedValue(me);

    renderGuarded();

    expect(await screen.findByText('Расписание')).toBeInTheDocument();
  });

  // ADR-0036: статуса «ждёт подтверждения» больше нет — RequireAuth не
  // ветвится по me.status вовсе, пускает по факту успешного /auth/me. Пустые
  // roles — обычный ученик (ADR-0026), не повод для особого экрана.
  it('вошедший с любым me (roles: [], status: active) рендерит вложенный маршрут — статуса ожидания не существует', async () => {
    const student: MeDto = {
      id: 's1',
      name: 'Ваня',
      roles: [],
      tz: 'Asia/Jerusalem',
      status: 'active',
      telegramLinked: false,
    };
    mockedApiFetch.mockResolvedValue(student);

    renderGuarded();

    expect(await screen.findByText('Расписание')).toBeInTheDocument();
  });

  // Задача 3: заблокированный (сессия жива, AuthGuard отверг 403-м) видит
  // отказ прямо здесь, не редирект на /login — там он получил бы тот же
  // отказ по новой (петля, тот же баг, что у email-входа, ревью PR #150).
  it('заблокированный (403) — виден alert с ACCESS_MESSAGE и кнопка «Выйти», редиректа на /login нет', async () => {
    mockedApiFetch.mockRejectedValue(
      new ApiError('Доступа нет. Обратитесь к администратору школы.', 403, 'forbidden'),
    );

    renderGuarded();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Доступа нет. Обратитесь к администратору школы.',
    );
    expect(screen.getByRole('button', { name: 'Выйти' })).toBeInTheDocument();
    expect(screen.queryByText('Экран входа')).not.toBeInTheDocument();
  });

  it('гость на /exams?tab=x — путь запоминается для возврата после входа (аудит L2)', async () => {
    mockedApiFetch.mockRejectedValue(new Error('нет сессии'));

    renderGuarded('/exams?tab=x');

    expect(await screen.findByText('Экран входа')).toBeInTheDocument();
    expect(consumeReturnTo()).toBe('/exams?tab=x');
  });

  it('вошедший — редиректа на /login нет, ничего не сохраняется', async () => {
    const me: MeDto = {
      id: 'u1',
      name: 'Дима',
      roles: ['teacher'],
      tz: 'Asia/Jerusalem',
      status: 'active',
      telegramLinked: false,
    };
    mockedApiFetch.mockResolvedValue(me);

    renderGuarded('/exams');

    expect(await screen.findByText('Экзамены')).toBeInTheDocument();
    expect(consumeReturnTo()).toBeNull();
  });

  it('«Повторить» на офлайне вызывает /auth/me снова', async () => {
    mockedApiFetch.mockRejectedValueOnce(new ApiError('Нет связи', 0, 'network'));
    const me: MeDto = {
      id: 'u1',
      name: 'Дима',
      roles: ['admin'],
      tz: 'Asia/Jerusalem',
      status: 'active',
      telegramLinked: false,
    };
    mockedApiFetch.mockResolvedValueOnce(me);

    const user = userEvent.setup();
    renderGuarded();
    await user.click(await screen.findByRole('button', { name: 'Повторить' }));

    expect(await screen.findByText('Расписание')).toBeInTheDocument();
  });
});
