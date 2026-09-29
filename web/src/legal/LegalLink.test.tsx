// Ссылки на политику и «Доступность» — одна на экран входа, приглашение,
// «Профиль» и сами страницы (ADR-0155, ADR-0158). Главное, что они обязаны:
// вести туда, где страница действительно открыта — адрес живёт в двух местах
// (PRIVACY_PATH в shared/ и ACCESSIBILITY_PATH для ссылок, путь маршрута в
// routeModules.ts), и разъехаться им нельзя.
import type { ReactElement } from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { PRIVACY_PATH } from '@xuanxue/shared';
import { ACCESSIBILITY_PATH } from '../accessibility/accessibilityPath';
import { ROUTE_MODULES } from '../app/routeModules';
import { LegalLink, LegalLinks } from './LegalLink';

function renderInRouter(element: ReactElement) {
  return render(<MemoryRouter>{element}</MemoryRouter>);
}

describe('LegalLink', () => {
  it('privacy — ведёт на PRIVACY_PATH со стандартной подписью', () => {
    renderInRouter(<LegalLink page="privacy" />);

    expect(
      screen.getByRole('link', { name: 'Политика конфиденциальности' }),
    ).toHaveAttribute('href', PRIVACY_PATH);
  });

  it('accessibility — ведёт на ACCESSIBILITY_PATH со стандартной подписью', () => {
    renderInRouter(<LegalLink page="accessibility" />);

    expect(screen.getByRole('link', { name: 'Доступность' })).toHaveAttribute(
      'href',
      ACCESSIBILITY_PATH,
    );
  });

  it('своя подпись заменяет стандартную, адрес остаётся тот же', () => {
    renderInRouter(<LegalLink page="privacy">Как мы храним данные</LegalLink>);

    expect(screen.getByRole('link', { name: 'Как мы храним данные' })).toHaveAttribute(
      'href',
      PRIVACY_PATH,
    );
    expect(
      screen.queryByRole('link', { name: 'Политика конфиденциальности' }),
    ).not.toBeInTheDocument();
  });

  it('адреса ссылок совпадают с путями маршрутов страниц', () => {
    expect(ROUTE_MODULES.privacy.path).toBe(PRIVACY_PATH);
    expect(ROUTE_MODULES.accessibility.path).toBe(ACCESSIBILITY_PATH);
  });

  // CLAUDE.md «Доступность»: цель нажатия ≥44. Раньше ссылка на политику была
  // строкой в 13px с линией на самой ссылке — цель вдвое ниже.
  it('цель нажатия — не ниже 44 пикселей', () => {
    renderInRouter(<LegalLink page="accessibility" />);

    expect(screen.getByRole('link', { name: 'Доступность' }).style.minHeight).toBe(
      '44px',
    );
  });
});

describe('LegalLinks', () => {
  it('обе ссылки рядом, у политики можно поменять подпись', () => {
    renderInRouter(<LegalLinks privacyLabel="Как мы храним данные" />);

    expect(screen.getByRole('link', { name: 'Как мы храним данные' })).toHaveAttribute(
      'href',
      PRIVACY_PATH,
    );
    expect(screen.getByRole('link', { name: 'Доступность' })).toHaveAttribute(
      'href',
      ACCESSIBILITY_PATH,
    );
  });

  it('без своей подписи — стандартная подпись политики', () => {
    renderInRouter(<LegalLinks />);

    expect(
      screen.getByRole('link', { name: 'Политика конфиденциальности' }),
    ).toBeInTheDocument();
  });
});
