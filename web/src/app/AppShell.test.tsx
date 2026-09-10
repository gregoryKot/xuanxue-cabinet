import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MeDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { apiFetch } from '../api/http';
import { AuthProvider } from '../auth/AuthProvider';
import { AppShell } from './AppShell';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

const mockedApiFetch = vi.mocked(apiFetch);

afterEach(() => {
  mockedApiFetch.mockReset();
});

function renderShell(me: MeDto) {
  mockedApiFetch.mockImplementation((path: string) => {
    if (path === '/auth/me') return Promise.resolve(me);
    if (path === '/auth/config') return Promise.resolve({});
    if (path === '/auth/logout') return Promise.resolve(undefined);
    return Promise.reject(new Error(`неожиданный путь: ${path}`));
  });

  return render(
    <MemoryRouter initialEntries={['/schedule']}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<p>Экран входа</p>} />
          <Route element={<AppShell />}>
            <Route path="/schedule" element={<p>Содержимое расписания</p>} />
          </Route>
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

const TEACHER: MeDto = {
  id: 'u1',
  name: 'Дима',
  roles: ['teacher'],
  tz: 'Asia/Jerusalem',
};
const STUDENT: MeDto = {
  id: 'u2',
  name: 'Ученик',
  roles: ['student'],
  tz: 'Asia/Jerusalem',
};

describe('AppShell — навигация по ширине экрана', () => {
  // Ветка «телефон»: по умолчанию matchMedia в setupTests отвечает «широкий
  // экран», поэтому нижняя панель без подмены не рисуется вовсе (отзыв
  // владельца 2026-09-09 — на мониторе она выглядела обрезком телефона).
  it('на телефоне навигация снизу, шириной колонки не задана', async () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({
        matches: true,
        addEventListener: () => {},
        removeEventListener: () => {},
      }),
    );
    renderShell(TEACHER);

    const nav = await screen.findByRole('navigation', { name: 'Разделы кабинета' });
    expect(nav.style.width).toBe('');

    vi.unstubAllGlobals();
  });

  it('на широком экране навигация — колонка слева', async () => {
    renderShell(TEACHER);

    const nav = await screen.findByRole('navigation', { name: 'Разделы кабинета' });
    expect(nav.style.flexDirection).toBe('column');
  });
});

describe('AppShell — учитель', () => {
  it('шапка, нижняя навигация «Занятия» и вложенный маршрут', async () => {
    renderShell(TEACHER);

    expect(await screen.findByText('Содержимое расписания')).toBeInTheDocument();
    expect(screen.getByText('Кабинет школы Сюань-Сюэ')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Занятия' })).toBeInTheDocument();
  });

  it('нижняя навигация — все шесть пунктов (pr-k3-fixes.md п.10)', async () => {
    renderShell(TEACHER);
    await screen.findByText('Содержимое расписания');

    for (const label of ['Сводка', 'Занятия', 'План', 'Каналы', 'Рассылки', 'Шаблоны']) {
      expect(screen.getByRole('link', { name: label })).toBeInTheDocument();
    }
  });

  it('«Выйти» — POST /auth/logout, затем переход на /login', async () => {
    const user = userEvent.setup();
    renderShell(TEACHER);
    await screen.findByText('Содержимое расписания');

    await user.click(screen.getByRole('button', { name: 'Выйти' }));

    expect(mockedApiFetch).toHaveBeenCalledWith(
      '/auth/logout',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(await screen.findByText('Экран входа')).toBeInTheDocument();
  });

  it('ошибка при «Выйти» (ApiError) — текст ошибки, маршрут не меняется', async () => {
    const { ApiError } = await import('../api/http');
    const user = userEvent.setup();
    mockedApiFetch.mockImplementation((path: string) => {
      if (path === '/auth/me') return Promise.resolve(TEACHER);
      if (path === '/auth/config') return Promise.resolve({});
      if (path === '/auth/logout')
        return Promise.reject(new ApiError('Сбой сервера', 500, 'unknown'));
      return Promise.reject(new Error(`неожиданный путь: ${path}`));
    });

    render(
      <MemoryRouter initialEntries={['/schedule']}>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<p>Экран входа</p>} />
            <Route element={<AppShell />}>
              <Route path="/schedule" element={<p>Содержимое расписания</p>} />
            </Route>
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );
    await screen.findByText('Содержимое расписания');

    await user.click(screen.getByRole('button', { name: 'Выйти' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Сбой сервера');
    expect(screen.getByText('Содержимое расписания')).toBeInTheDocument();
  });

  it('ошибка при «Выйти» (не ApiError) — общий текст', async () => {
    const user = userEvent.setup();
    mockedApiFetch.mockImplementation((path: string) => {
      if (path === '/auth/me') return Promise.resolve(TEACHER);
      if (path === '/auth/config') return Promise.resolve({});
      if (path === '/auth/logout') return Promise.reject(new Error('network down'));
      return Promise.reject(new Error(`неожиданный путь: ${path}`));
    });

    render(
      <MemoryRouter initialEntries={['/schedule']}>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<p>Экран входа</p>} />
            <Route element={<AppShell />}>
              <Route path="/schedule" element={<p>Содержимое расписания</p>} />
            </Route>
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );
    await screen.findByText('Содержимое расписания');

    await user.click(screen.getByRole('button', { name: 'Выйти' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Не удалось выйти. Попробуйте ещё раз.',
    );
  });
});

describe('AppShell — ученик (без роли teacher/admin)', () => {
  it('вместо маршрута — StudentScreen, без нижней навигации', async () => {
    renderShell(STUDENT);

    expect(await screen.findByText('Кабинет для учителя.')).toBeInTheDocument();
    expect(screen.queryByText('Содержимое расписания')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Занятия' })).not.toBeInTheDocument();
  });

  it('«Выйти» доступна и ученику', async () => {
    renderShell(STUDENT);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Выйти' })).toBeEnabled(),
    );
  });
});
