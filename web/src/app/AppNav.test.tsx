// Навигация в двух видах (отзыв владельца 2026-09-09): на телефоне —
// нижняя панель, на широком экране — колонка слева. Плюс фильтр по роли и
// подсветка активного раздела (docs/adr/0025-navigation-by-domain.md).
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import type { MeDto } from '@xuanxue/shared';
import { AppNav, SIDE_NAV_WIDTH_PX } from './AppNav';

const TEACHER: MeDto = { id: 'u1', name: 'Дима', roles: ['teacher'], tz: 'UTC' };
const ADMIN: MeDto = { id: 'a1', name: 'Маша', roles: ['admin'], tz: 'UTC' };

function renderNav(isMobile: boolean, me: MeDto | null = TEACHER, path = '/planning') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppNav isMobile={isMobile} me={me} />
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

    const nav = screen.getByRole('navigation', { name: 'Разделы кабинета' });
    expect(nav.style.width).toBe(`${SIDE_NAV_WIDTH_PX}px`);
    expect(nav.style.flexDirection).toBe('column');
  });

  // Панель уезжала вверх вместе со списком занятий (отзыв владельца
  // 2026-09-10): на телефоне она должна оставаться на месте.
  it('телефон — панель прибита к низу экрана', () => {
    renderNav(true);

    const nav = screen.getByRole('navigation', { name: 'Разделы кабинета' });
    expect(nav.style.position).toBe('sticky');
    expect(nav.style.bottom).toBe('0px');
  });
});

describe('AppNav — пункты и роль (отзыв владельца 2026-09-12)', () => {
  it('не-админ — три пункта, «Ученики» скрыт', () => {
    renderNav(true, TEACHER);

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

  it('подписи видны в обоих видах — иконка без слова не читается', () => {
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
});
