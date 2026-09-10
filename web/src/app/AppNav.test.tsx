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

  it('подписи пунктов видны в обоих видах — иконка без слова не читается', () => {
    const { unmount } = renderNav(true);
    expect(screen.getByText('Занятия')).toBeInTheDocument();
    unmount();

    renderNav(false);
    expect(screen.getByText('Занятия')).toBeInTheDocument();
  });
});
