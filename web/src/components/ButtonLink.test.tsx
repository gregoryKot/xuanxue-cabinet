import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { ButtonLink } from './ButtonLink';

function renderLink(variant?: 'primary' | 'secondary') {
  render(
    <MemoryRouter>
      <ButtonLink to="/notifications/settings" variant={variant}>
        Выбрать занятия
      </ButtonLink>
    </MemoryRouter>,
  );
  return screen.getByRole('link', { name: 'Выбрать занятия' });
}

describe('ButtonLink', () => {
  it('это ссылка с адресом, а не кнопка', () => {
    expect(renderLink()).toHaveAttribute('href', '/notifications/settings');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('силуэт кнопки: цель не меньше 44, заливка у главного действия, без подчёркивания', () => {
    const link = renderLink();

    expect(link).toHaveStyle({
      minHeight: '44px',
      minWidth: '44px',
      textDecoration: 'none',
      background: 'var(--terracotta)',
    });
  });

  it('вторичный силуэт — контур без заливки', () => {
    expect(renderLink('secondary')).toHaveStyle({ background: 'transparent' });
  });
});
