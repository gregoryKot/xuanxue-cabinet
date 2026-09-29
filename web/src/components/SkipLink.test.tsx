// «Перейти к содержимому» (WCAG 2.4.1, ADR-0158): первый Tab попадает на
// ссылку, а активация уводит фокус в <main> — без записи в историю. Тест идёт
// клавиатурой, как ходит человек, а не кликом по элементу.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { SkipLink, mainLandmarkProps } from './SkipLink';

function renderPage() {
  return render(
    <>
      <SkipLink />
      <nav aria-label="Меню">
        <a href="/menu">Пункт меню</a>
      </nav>
      <main {...mainLandmarkProps}>
        <button type="button">Действие страницы</button>
      </main>
    </>,
  );
}

describe('SkipLink', () => {
  it('первый Tab попадает на ссылку «Перейти к содержимому»', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.tab();

    expect(screen.getByRole('link', { name: 'Перейти к содержимому' })).toHaveFocus();
  });

  it('Enter переводит фокус в <main>, а следующий Tab идёт к его содержимому мимо меню', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.tab();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('main')).toHaveFocus();

    await user.tab();
    expect(screen.getByRole('button', { name: 'Действие страницы' })).toHaveFocus();
  });

  it('переход не пишет хеш в адрес: «Назад» не возвращает на ту же страницу', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.tab();
    await user.keyboard('{Enter}');

    expect(window.location.hash).toBe('');
  });

  it('<main> не в порядке Tab: попасть на него можно только через ссылку', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.tab();
    await user.tab();

    expect(screen.getByRole('link', { name: 'Пункт меню' })).toHaveFocus();
    expect(screen.getByRole('main')).not.toHaveFocus();
  });
});
