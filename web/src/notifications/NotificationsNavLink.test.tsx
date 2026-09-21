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

function renderLink(unreadCount: number) {
  mockApiByPath({
    [MY_EXAMS_PATH]: [],
    [NOTIFICATIONS_FEED_PATH]: { items: [], unreadCount },
  });
  return render(
    <MemoryRouter>
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

  it('нулевой счётчик — пилюли нет', async () => {
    renderLink(0);

    const link = await screen.findByRole('link', { name: 'Уведомления' });
    expect(link.querySelector('span')).toBeNull();
  });

  it('ненулевой счётчик — пилюля с числом рядом с подписью', async () => {
    renderLink(4);

    const link = await screen.findByRole('link', { name: 'Уведомления, 4 новых' });
    expect(link).toHaveTextContent('Уведомления4');
  });
});
