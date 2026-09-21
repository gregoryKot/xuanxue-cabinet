// Знак школы как ссылка на главную (SchoolBrandLink.tsx) — адрес передаёт
// вызывающий, сама ссылка про роли не знает (AppNav.test.tsx и
// AppShellBrandRow.test.tsx проверяют, что вызывающие передают верный
// адрес по роли).
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { SchoolBrandLink } from './SchoolBrandLink';

function renderLink(to: string) {
  return render(
    <MemoryRouter>
      <SchoolBrandLink to={to} titleStyle={{}} />
    </MemoryRouter>,
  );
}

describe('SchoolBrandLink', () => {
  it('ведёт по переданному адресу', () => {
    renderLink('/planning');
    expect(screen.getByRole('link', { name: 'Школа Сюань-Сюэ' })).toHaveAttribute(
      'href',
      '/planning',
    );
  });

  // Знак рядом декоративный (alt="", SchoolMark.tsx) — доступное имя ссылки
  // целиком идёт от видимого названия, aria-label не нужен.
  it('доступное имя ссылки — «Школа Сюань-Сюэ»', () => {
    renderLink('/tasks');
    expect(screen.getByRole('link', { name: 'Школа Сюань-Сюэ' })).toBeInTheDocument();
  });
});
