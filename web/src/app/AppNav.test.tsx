// Навигация в двух видах (отзыв владельца 2026-09-09): на телефоне —
// нижняя панель, на широком экране — колонка слева. Плюс фильтр по роли,
// подсветка активного раздела (docs/adr/0025-navigation-by-domain.md) и
// блок человека внизу колонки (ADR-0043).
import type { ReactNode } from 'react';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import type { MeDto } from '@xuanxue/shared';
import { AppNav, SIDE_NAV_WIDTH_PX } from './AppNav';

const TEACHER: MeDto = {
  id: 'u1',
  name: 'Дима',
  roles: ['teacher'],
  tz: 'UTC',
  status: 'active',
  telegramLinked: false,
  botChatActive: false,
};
const ADMIN: MeDto = {
  id: 'a1',
  name: 'Маша',
  roles: ['admin'],
  tz: 'UTC',
  status: 'active',
  telegramLinked: false,
  botChatActive: false,
};

function renderNav(
  isMobile: boolean,
  me: MeDto | null = TEACHER,
  path = '/planning',
  personProps: { notificationsLink?: ReactNode; logoutButton?: ReactNode } = {},
) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppNav isMobile={isMobile} me={me} {...personProps} />
    </MemoryRouter>,
  );
}

describe('AppNav — раскладка', () => {
  // Проверяем ширину и направление, а не рамку: значения через `var(--…)`
  // jsdom не вычисляет, и сравнение стилей на них всегда ложно-отрицательное.
  it('телефон — панель во всю ширину, без боковой колонки', () => {
    renderNav(true);

    const nav = screen.getByRole('navigation', { name: 'Разделы кабинета' });
    expect(nav.style.width).toBe('');
    expect(nav.style.flexDirection).toBe('');
  });

  it('широкий экран — колонка слева фиксированной ширины', () => {
    renderNav(false);

    // Ширину несёт сама колонка, а `<nav>` внутри неё — только пункты
    // (знак школы и блок человека лежат рядом, вне ориентира).
    const column = screen.getByRole('navigation', {
      name: 'Разделы кабинета',
    }).parentElement;
    expect(column?.style.width).toBe(`${SIDE_NAV_WIDTH_PX}px`);
    expect(column?.style.flexDirection).toBe('column');
  });

  // Панель сперва уезжала вверх вместе со списком (отзыв владельца
  // 2026-09-10), а вылеченная через `sticky` — прыгала на оттяжке iOS: там
  // инерция двигает весь документ разом (отзыв 2026-09-18). Теперь она вне
  // прокрутки вовсе — низ колонки оболочки, высота которой равна экрану
  // (AppShell.tsx). Гейт от возврата к `sticky`/`fixed`.
  it('телефон — панель вне прокрутки, без sticky и fixed', () => {
    renderNav(true);

    const nav = screen.getByRole('navigation', { name: 'Разделы кабинета' });
    expect(nav.style.position).toBe('');
    expect(nav.style.flexShrink).toBe('0');
  });
});

describe('AppNav — пункты и роль (отзыв владельца 2026-09-12, уточнение ADR-0030)', () => {
  it('ученик без роли — три пункта, «Ученики» скрыт', () => {
    const student: MeDto = { ...TEACHER, roles: [] };
    renderNav(true, student);

    const nav = screen.getByRole('navigation', { name: 'Разделы кабинета' });
    const labels = screen
      .getAllByRole('link')
      .map((link) => link.textContent)
      .filter((label): label is string => label !== null);
    expect(labels).toEqual(['Занятия', 'Рассылки', 'Экзамены']);
    expect(nav).not.toHaveTextContent('Ученики');
  });

  it('админ — четыре пункта, «Ученики» последним', () => {
    renderNav(true, ADMIN);

    const labels = screen.getAllByRole('link').map((link) => link.textContent);
    expect(labels).toEqual(['Занятия', 'Рассылки', 'Экзамены', 'Ученики']);
  });

  // ADR-0030 (уточнение владельца 2026-09-15): ссылку-приглашение раздаёт и
  // учитель — «Ученики» открыт ему тоже, не только admin.
  it('учитель — тоже видит «Ученики» (ADR-0030, ссылка-приглашение)', () => {
    renderNav(true, TEACHER);

    const labels = screen.getAllByRole('link').map((link) => link.textContent);
    expect(labels).toEqual(['Занятия', 'Рассылки', 'Экзамены', 'Ученики']);
  });

  // Иконок в пунктах нет вовсе (ADR-0043) — подпись остаётся единственным
  // содержимым ссылки что на телефоне, что в колонке.
  it('подпись видна в обоих видах — единственное содержимое пункта', () => {
    const { unmount } = renderNav(true);
    expect(screen.getByText('Занятия')).toBeInTheDocument();
    unmount();

    renderNav(false);
    expect(screen.getByText('Занятия')).toBeInTheDocument();
  });
});

describe('AppNav — подсветка раздела', () => {
  it('открыт сам раздел — его ссылка активна', () => {
    renderNav(true, TEACHER, '/broadcasts');

    expect(screen.getByRole('link', { name: /Рассылки/ })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: /Занятия/ })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('открыт подэкран раздела — подсвечен сам раздел, не подэкран', () => {
    renderNav(true, TEACHER, '/channels');

    expect(screen.getByRole('link', { name: /Рассылки/ })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('путь вне навигации — ни один пункт не подсвечен', () => {
    renderNav(true, TEACHER, '/login');

    for (const link of screen.getAllByRole('link')) {
      expect(link).not.toHaveAttribute('aria-current');
    }
  });

  // Направление «Тёплая школа» (ADR-0043) сняло киноварную точку «вы
  // здесь» — активность теперь только заливка и тень (jsdom их не считает,
  // см. «раскладка» выше), а на разметке проверяем, что старой точки не
  // осталось нигде: механика заменена, не задублирована.
  it('старой точки-маркера в разметке больше нет — ни у активного, ни у остальных', () => {
    renderNav(true, TEACHER, '/broadcasts');

    const active = screen.getByRole('link', { name: /Рассылки/ });
    expect(active).toHaveAttribute('aria-current', 'page');
    expect(active.querySelector('.xuanxue-nav-dot')).toBeNull();

    const inactive = screen.getByRole('link', { name: /Занятия/ });
    expect(inactive.querySelector('.xuanxue-nav-dot')).toBeNull();
  });
});

// Отзыв владельца: `minHeight: 44` (цель нажатия) стояла прямо на видимой
// плашке и раздула её заметно крупнее макета (~34px). Цель нажатия остаётся
// на `<Link>` (невидимая), плашку макета несёт внутренний `<span>` —
// pillBaseStyle (people/PersonRoleBadge.tsx) сделан тем же приёмом.
describe('AppNav — цель нажатия и плашка нижней панели разведены', () => {
  it('плашка — внутренний <span> без своей минимальной высоты, у <Link> нет фона', () => {
    renderNav(true, TEACHER, '/planning');

    const active = screen.getByRole('link', { name: 'Занятия' });
    expect(active.style.minHeight).toBe('44px');
    expect(active.style.background).toBe('');

    const pill = active.querySelector('span') as HTMLElement;
    expect(pill).not.toBeNull();
    expect(pill.style.minHeight).toBe('');
    expect(pill.textContent).toBe('Занятия');
  });
});

describe('AppNav — знак школы (ADR-0043)', () => {
  it('в боковой колонке — знак и название видны', () => {
    renderNav(false);
    expect(screen.getByText('Школа Сюань-Сюэ')).toBeInTheDocument();
  });

  // Мокап (screens/1c-planning.html) не рисует знак в панели вкладок —
  // на телефоне его показывает AppShell.tsx, первой строкой над содержимым.
  it('в панели вкладок телефона — знака нет, это забота AppShell.tsx', () => {
    renderNav(true);
    expect(screen.queryByText('Школа Сюань-Сюэ')).not.toBeInTheDocument();
  });
});

describe('AppNav — блок человека (боковая колонка, ADR-0043)', () => {
  // Ровно то, чего боялся владелец при переносе подвала в колонку: имя,
  // «Уведомления» и «Выйти» должны остаться доступны, просто в другом месте.
  it('на широком экране — переданные «Уведомления» и «Выйти» видны внизу колонки', () => {
    renderNav(false, TEACHER, '/planning', {
      notificationsLink: <a href="/notifications">Уведомления</a>,
      logoutButton: <button type="button">Выйти</button>,
    });

    const nav = screen.getByRole('navigation', { name: 'Разделы кабинета' });
    const column = nav.parentElement as HTMLElement;

    expect(within(column).getByText(/Вы вошли как Дима/)).toBeInTheDocument();
    expect(within(column).getByRole('link', { name: 'Уведомления' })).toBeInTheDocument();
    expect(within(column).getByRole('button', { name: 'Выйти' })).toBeInTheDocument();

    // Блок человека стоит РЯДОМ с ориентиром, не внутри него: имя «Разделы
    // кабинета» обязано покрывать только разделы, иначе скринридер, идущий по
    // ориентирам, найдёт под ним ещё и «Выйти» (CLAUDE.md «Доступность»).
    expect(within(nav).queryByRole('button', { name: 'Выйти' })).not.toBeInTheDocument();
    expect(within(nav).queryByText(/Вы вошли как/)).not.toBeInTheDocument();
  });

  // Мокап телефона такой блок не рисует вовсе — эту роль на телефоне играет
  // подвал AppShell.tsx, а не эта колонка (её на телефоне и не видно).
  it('на телефоне блок человека не рисуется, даже если узлы переданы', () => {
    renderNav(true, TEACHER, '/planning', {
      notificationsLink: <a href="/notifications">Уведомления</a>,
      logoutButton: <button type="button">Выйти</button>,
    });

    expect(screen.queryByText(/Вы вошли как/)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Уведомления' })).not.toBeInTheDocument();
  });
});
