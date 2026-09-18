// Строка «знак школы + название» без боковой колонки (AppShell.tsx) — на
// телефоне вместо имени человека стоит значок профиля, ссылка на «Профиль»
// (ADR-0045). На мониторе (боковой колонки у ученика не бывает, но это не
// телефон) — только знак и название, без ссылки: там эту роль играет подвал
// под содержимым.
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AppShellBrandRow } from './AppShellBrandRow';

function renderRow(isMobile: boolean) {
  return render(
    <MemoryRouter>
      <AppShellBrandRow isMobile={isMobile} />
    </MemoryRouter>,
  );
}

describe('AppShellBrandRow', () => {
  it('знак и название видны в обоих видах', () => {
    renderRow(false);
    expect(screen.getByText('Школа Сюань-Сюэ')).toBeInTheDocument();
  });

  it('телефон — значок профиля ведёт на «Профиль», имени человека в строке нет', () => {
    renderRow(true);

    const link = screen.getByRole('link', { name: 'Профиль' });
    expect(link).toHaveAttribute('href', '/profile');
    // Имя человека здесь больше не показывается (отзыв владельца 2026-09-18)
    // — только значок, названный aria-label ссылки.
    expect(link).toHaveTextContent('');
  });

  it('монитор (ученик без боковой колонки) — ссылки нет, это подвал под содержимым', () => {
    renderRow(false);

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
