// Навигация в двух видах (отзыв владельца 2026-09-09): на телефоне —
// нижняя панель, на широком экране — колонка слева. Проверяем именно
// раскладку, а не список пунктов: он свой у navItems.ts и покрыт AppShell.
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AppNav, SIDE_NAV_WIDTH_PX } from './AppNav';

function renderNav(isMobile: boolean) {
  return render(
    <MemoryRouter initialEntries={['/schedule']}>
      <AppNav isMobile={isMobile} />
    </MemoryRouter>,
  );
}

describe('AppNav', () => {
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
  // 2026-09-10): на телефоне она должна оставаться на месте, иначе до другого
  // раздела приходится прокручивать весь список обратно.
  it('телефон — панель прибита к низу экрана', () => {
    renderNav(true);

    const nav = screen.getByRole('navigation', { name: 'Разделы кабинета' });
    expect(nav.style.position).toBe('sticky');
    expect(nav.style.bottom).toBe('0px');
  });

  it('широкий экран — колонка слева ничего не прибивает', () => {
    renderNav(false);

    const nav = screen.getByRole('navigation', { name: 'Разделы кабинета' });
    expect(nav.style.position).toBe('');
  });

  it('подписи пунктов видны в обоих видах — иконка без слова не читается', () => {
    const { unmount } = renderNav(true);
    expect(screen.getByText('Занятия')).toBeInTheDocument();
    unmount();

    renderNav(false);
    expect(screen.getByText('Занятия')).toBeInTheDocument();
  });
});
