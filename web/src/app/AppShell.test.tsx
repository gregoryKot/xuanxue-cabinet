import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { MeDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { mockedApiFetch, resetApiFetchBetweenTests } from '../test-support/apiFetchMock';
import { AuthProvider } from '../auth/AuthProvider';
import { AppShell } from './AppShell';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();

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
const ASSISTANT: MeDto = {
  id: 'u3',
  name: 'Помощник',
  roles: ['assistant'],
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

  // Пунктов три, и это потолок (navItems.ts, отзыв владельца 2026-09-11):
  // каналы, шаблоны, слоты расписания и люди ушли в «Настройки» одной
  // страницей. Тест ловит возврат вкладок наравне с ежедневным.
  it('нижняя навигация — ровно три пункта', async () => {
    renderShell(TEACHER);
    await screen.findByText('Содержимое расписания');

    const nav = screen.getByRole('navigation', { name: 'Разделы кабинета' });
    const labels = within(nav)
      .getAllByRole('link')
      .map((link) => link.textContent);
    expect(labels).toEqual(['Сводка', 'Занятия', 'Настройки']);
  });
});

describe('AppShell — помощник учителя', () => {
  it('правами равен учителю — тот же маршрут и та же навигация', async () => {
    renderShell(ASSISTANT);

    expect(await screen.findByText('Содержимое расписания')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Занятия' })).toBeInTheDocument();
  });
});

describe('AppShell — ученик (без роли teacher/assistant/admin)', () => {
  it('вместо маршрута — StudentScreen, без нижней навигации', async () => {
    renderShell(STUDENT);

    expect(await screen.findByText('Кабинет для учителя.')).toBeInTheDocument();
    expect(screen.queryByText('Содержимое расписания')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Занятия' })).not.toBeInTheDocument();
  });

  // «Выйти» ученику нужна: навигации у него нет, до «Настроек» он не дойдёт
  // (StudentScreen.tsx).
  it('«Выйти» доступна и ученику', async () => {
    renderShell(STUDENT);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Выйти' })).toBeEnabled(),
    );
  });
});
