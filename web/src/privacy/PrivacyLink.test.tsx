// Ссылка на политику конфиденциальности — одна на экран входа и страницу
// приглашения (ADR-0155). Главное, что она обязана: вести туда, где страница
// действительно открыта, — адрес живёт в двух местах (PRIVACY_PATH в shared/ для
// ссылок и бота, путь маршрута в routeModules.ts), и разъехаться им нельзя.
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { PRIVACY_PATH } from '@xuanxue/shared';
import { ROUTE_MODULES } from '../app/routeModules';
import { PrivacyLink } from './PrivacyLink';

describe('PrivacyLink', () => {
  it('ведёт на PRIVACY_PATH и показывает переданную подпись', () => {
    render(
      <MemoryRouter>
        <PrivacyLink>Как мы храним данные</PrivacyLink>
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: 'Как мы храним данные' })).toHaveAttribute(
      'href',
      PRIVACY_PATH,
    );
  });

  it('PRIVACY_PATH совпадает с путём маршрута страницы политики', () => {
    expect(ROUTE_MODULES.privacy.path).toBe(PRIVACY_PATH);
  });
});
