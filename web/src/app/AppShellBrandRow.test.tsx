// Строка «знак школы + название» без боковой колонки (AppShell.tsx) — на
// телефоне имя человека становится ссылкой на «Уведомления», на мониторе
// (боковой колонки у ученика не бывает, но это не телефон) — только знак и
// название, без ссылки: там эту роль играет подвал под содержимым.
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AppShellBrandRow } from './AppShellBrandRow';

function renderRow(isMobile: boolean, name?: string) {
  return render(
    <MemoryRouter>
      <AppShellBrandRow isMobile={isMobile} name={name} />
    </MemoryRouter>,
  );
}

describe('AppShellBrandRow', () => {
  it('знак и название видны в обоих видах', () => {
    renderRow(false, 'Дима');
    expect(screen.getByText('Школа Сюань-Сюэ')).toBeInTheDocument();
  });

  it('телефон — имя человека ведёт на «Уведомления»', () => {
    renderRow(true, 'Дима');

    const link = screen.getByRole('link', { name: 'Уведомления' });
    expect(link).toHaveAttribute('href', '/notifications');
    expect(link).toHaveTextContent('Дима');
  });

  it('телефон, имени ещё нет — честный прочерк, не пустая ссылка', () => {
    renderRow(true, undefined);

    expect(screen.getByRole('link', { name: 'Уведомления' })).toHaveTextContent('—');
  });

  it('монитор (ученик без боковой колонки) — ссылки нет, это подвал под содержимым', () => {
    renderRow(false, 'Дима');

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
