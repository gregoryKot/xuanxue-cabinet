// Тесты облика значка уведомлений для монитора (ADR-0063) — та же сеть, что
// у NotificationBell.test.tsx: провайдер ходит в /me/inbox и /me/exams.
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { MY_EXAMS_PATH, NOTIFICATIONS_FEED_PATH } from '../api/apiPaths';
import type * as HttpModule from '../api/http';
import { MyExamsProvider } from '../student/MyExamsProvider';
import { mockApiByPath, resetApiFetchBetweenTests } from '../test-support/apiFetchMock';
import { NotificationsNavLink } from './NotificationsNavLink';
import { NotificationsProvider } from './NotificationsProvider';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();

function renderLink(unreadCount: number, path = '/planning') {
  mockApiByPath({
    [MY_EXAMS_PATH]: [],
    [NOTIFICATIONS_FEED_PATH]: { items: [], unreadCount },
  });
  return render(
    <MemoryRouter initialEntries={[path]}>
      <MyExamsProvider me={null}>
        <NotificationsProvider me={null}>
          <NotificationsNavLink />
        </NotificationsProvider>
      </MyExamsProvider>
    </MemoryRouter>,
  );
}

describe('NotificationsNavLink', () => {
  it('видимый текст «Уведомления», ссылка ведёт на экран', async () => {
    renderLink(0);

    const link = await screen.findByRole('link', { name: 'Уведомления' });
    expect(link).toHaveTextContent('Уведомления');
    expect(link).toHaveAttribute('href', '/notifications');
  });

  // Отзыв владельца 2026-09-21: на прежнем месте (текстовая ссылка внизу
  // колонки) значка было не найти. Колокольчик — decorative-only, место
  // называет aria-label ссылки (badgeLabel), не сам svg.
  it('рисует колокольчик — svg рядом с подписью, aria-hidden', async () => {
    renderLink(0);

    const link = await screen.findByRole('link', { name: 'Уведомления' });
    const icon = link.querySelector('svg');
    expect(icon).not.toBeNull();
    expect(icon).toHaveAttribute('aria-hidden', 'true');
  });

  it('нулевой счётчик — пилюли нет', async () => {
    renderLink(0);

    const link = await screen.findByRole('link', { name: 'Уведомления' });
    // Обёртка пилюли (marginLeft: auto) всегда в разметке — сама пилюля
    // рисуется только при count > 0 (NotificationCount.tsx).
    expect(link.querySelectorAll('span')).toHaveLength(1);
  });

  it('ненулевой счётчик — пилюля с числом рядом с подписью', async () => {
    renderLink(4);

    const link = await screen.findByRole('link', { name: 'Уведомления, 4 новых' });
    expect(link).toHaveTextContent('Уведомления4');
    expect(link.querySelectorAll('span')).toHaveLength(2);
  });

  // Строка встаёт среди пунктов меню (AppNav.tsx) — без aria-current она
  // выглядела бы там сломанной, когда открыт сам центр уведомлений.
  it('открыт сам центр уведомлений — aria-current="page"', async () => {
    renderLink(0, '/notifications');

    const link = await screen.findByRole('link', { name: 'Уведомления' });
    expect(link).toHaveAttribute('aria-current', 'page');
  });

  it('открыт другой путь — aria-current отсутствует', async () => {
    renderLink(0, '/planning');

    const link = await screen.findByRole('link', { name: 'Уведомления' });
    expect(link).not.toHaveAttribute('aria-current');
  });
});
