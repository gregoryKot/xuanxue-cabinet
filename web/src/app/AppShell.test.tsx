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

function renderShell(me: MeDto, initialPath = '/schedule') {
  mockedApiFetch.mockImplementation((path: string) => {
    if (path === '/auth/me') return Promise.resolve(me);
    if (path === '/auth/config') return Promise.resolve({});
    if (path === '/auth/logout') return Promise.resolve(undefined);
    // StudentScreen (ученик без роли) грузит свои ближайшие занятия и
    // экзамены — student/useMyLessons.ts, student/useMyExams.ts; здесь
    // список не важен, важно, что маршрут не виснет на незамоканном пути.
    if (path === '/me/lessons') return Promise.resolve([]);
    if (path === '/me/exams') return Promise.resolve([]);
    return Promise.reject(new Error(`неожиданный путь: ${path}`));
  });

  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<p>Экран входа</p>} />
          <Route element={<AppShell />}>
            <Route path="/schedule" element={<p>Содержимое расписания</p>} />
            {/* Личная настройка человека — маршрут внутри AppShell, но не
                за ролевым гвардом (ТЗ notifications-web.md): проверяем, что
                AppShell отдаёт под него Outlet и ученику. */}
            <Route path="/notifications" element={<p>Экран уведомлений</p>} />
            {/* Экран сдачи — та же исключительная логика (ТЗ
                student-exams.md): ученик должен попасть на сам маршрут. */}
            <Route path="/attempts/:id" element={<p>Экран сдачи</p>} />
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
  status: 'active',
};
const ADMIN: MeDto = {
  id: 'a1',
  name: 'Маша',
  roles: ['admin'],
  tz: 'Asia/Jerusalem',
  status: 'active',
};
const STUDENT: MeDto = {
  id: 'u2',
  name: 'Ученик',
  roles: ['student'],
  tz: 'Asia/Jerusalem',
  status: 'active',
};
const ASSISTANT: MeDto = {
  id: 'u3',
  name: 'Помощник',
  roles: ['assistant'],
  tz: 'Asia/Jerusalem',
  status: 'active',
};
const INVITED: MeDto = {
  id: 'u4',
  name: 'Новенький',
  roles: [],
  tz: 'Asia/Jerusalem',
  status: 'invited',
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

  // Четыре домена — потолок навигации (navItems.ts, отзыв владельца
  // 2026-09-12: «меню всё ещё сложное»); «Ученики» — только у админа.
  // Фильтр по роли и подсветку раздела детально проверяет AppNav.test.tsx —
  // здесь только то, что AppShell передаёт в AppNav настоящего `me`.
  it('нижняя навигация — три пункта у учителя, «Ученики» скрыт', async () => {
    renderShell(TEACHER);
    await screen.findByText('Содержимое расписания');

    const nav = screen.getByRole('navigation', { name: 'Разделы кабинета' });
    const labels = within(nav)
      .getAllByRole('link')
      .map((link) => link.textContent);
    expect(labels).toEqual(['Занятия', 'Рассылки', 'Экзамены']);
  });

  it('нижняя навигация — у админа ещё и «Ученики»', async () => {
    renderShell(ADMIN);
    await screen.findByText('Содержимое расписания');

    const nav = screen.getByRole('navigation', { name: 'Разделы кабинета' });
    const labels = within(nav)
      .getAllByRole('link')
      .map((link) => link.textContent);
    expect(labels).toEqual(['Занятия', 'Рассылки', 'Экзамены', 'Ученики']);
  });

  // Подвал заменил кнопку «Выйти» из бывших «Настроек» (отзыв владельца
  // 2026-09-12: висела на каждом экране, хотя нужна раз в жизни).
  it('подвал под содержимым — имя вошедшего и «Выйти»', async () => {
    renderShell(TEACHER);
    await screen.findByText('Содержимое расписания');

    expect(screen.getByText(/Вы вошли как Дима/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Выйти' })).toBeInTheDocument();
  });

  // Личная настройка, не раздел домена — ссылка живёт в общем подвале, не в
  // NAV_ITEMS (docs/adr/0025-navigation-by-domain.md).
  it('подвал — ссылка «Уведомления»', async () => {
    renderShell(TEACHER);
    await screen.findByText('Содержимое расписания');

    expect(screen.getByRole('link', { name: 'Уведомления' })).toHaveAttribute(
      'href',
      '/notifications',
    );
  });
});

describe('AppShell — status: invited (ADR-0026)', () => {
  it('вместо маршрута — экран ожидания, содержимое маршрута не рисуется', async () => {
    renderShell(INVITED);

    expect(
      await screen.findByRole('heading', { name: 'Ждём подтверждения' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Содержимое расписания')).not.toBeInTheDocument();
  });

  // Тот же статус со status: 'active' (STUDENT) не должен показывать экран
  // ожидания — граница между ними держится на одном поле MeDto.status.
  it('status: active — экрана ожидания нет', async () => {
    renderShell(STUDENT);

    await screen.findByText('Ближайших занятий пока нет.');
    expect(
      screen.queryByRole('heading', { name: 'Ждём подтверждения' }),
    ).not.toBeInTheDocument();
  });

  it('без нижней/боковой навигации', async () => {
    renderShell(INVITED);
    await screen.findByRole('heading', { name: 'Ждём подтверждения' });

    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Занятия' })).not.toBeInTheDocument();
  });

  // Подвал общий (StudentScreen тоже его использует) — «Выйти» остаётся
  // доступной и на экране ожидания: человек мог войти чужим аккаунтом.
  it('подвал — «Выйти» доступна', async () => {
    renderShell(INVITED);
    await screen.findByRole('heading', { name: 'Ждём подтверждения' });

    expect(screen.getByRole('button', { name: 'Выйти' })).toBeInTheDocument();
  });

  // Ссылка на маршрут, который invited всё равно не откроет (API закрыт до
  // подтверждения), только сбивала бы с толку — в отличие от подвала
  // ученика (STUDENT ниже), где та же ссылка рабочая.
  it('подвал — ссылки «Уведомления» нет', async () => {
    renderShell(INVITED);
    await screen.findByRole('heading', { name: 'Ждём подтверждения' });

    expect(screen.queryByRole('link', { name: 'Уведомления' })).not.toBeInTheDocument();
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

    expect(await screen.findByText('Ближайших занятий пока нет.')).toBeInTheDocument();
    expect(screen.queryByText('Содержимое расписания')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Занятия' })).not.toBeInTheDocument();
  });

  // «Выйти» ученику нужна: навигации у него нет, кнопка — в общем подвале
  // (StudentScreen.tsx отдал сюда свою).
  it('«Выйти» доступна и ученику', async () => {
    renderShell(STUDENT);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Выйти' })).toBeEnabled(),
    );
  });

  // Подвал общий (ТЗ notifications-web.md): ссылка на «Уведомления» видна и
  // ученику, хотя нижней навигации у него нет вовсе.
  it('подвал — ссылка «Уведомления» видна и ученику', async () => {
    renderShell(STUDENT);
    await screen.findByText('Ближайших занятий пока нет.');

    expect(screen.getByRole('link', { name: 'Уведомления' })).toHaveAttribute(
      'href',
      '/notifications',
    );
  });

  // Маршрут не спрятан за ролевым гвардом: ученик на «/notifications»
  // видит не StudentScreen, а сам экран.
  it('на «/notifications» — сам маршрут, не StudentScreen', async () => {
    renderShell(STUDENT, '/notifications');

    expect(await screen.findByText('Экран уведомлений')).toBeInTheDocument();
    expect(screen.queryByText('Ближайших занятий пока нет.')).not.toBeInTheDocument();
  });

  // То же самое для экрана сдачи (ТЗ student-exams.md) — вход в него не
  // ролевая настройка, а кнопка на экране ученика, но сам маршрут должен
  // открываться, а не подменяться StudentScreen.
  it('на «/attempts/:id» — сам маршрут, не StudentScreen', async () => {
    renderShell(STUDENT, '/attempts/a1');

    expect(await screen.findByText('Экран сдачи')).toBeInTheDocument();
    expect(screen.queryByText('Ближайших занятий пока нет.')).not.toBeInTheDocument();
  });
});
