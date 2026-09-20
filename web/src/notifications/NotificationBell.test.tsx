// Тесты телефонного облика значка уведомлений (ADR-0063) — сеть провайдера
// замокана тем же приёмом, что useNotificationsData.test.ts.
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { MY_EXAMS_PATH, NOTIFICATIONS_FEED_PATH } from '../api/apiPaths';
import type * as HttpModule from '../api/http';
import { mockApiByPath, resetApiFetchBetweenTests } from '../test-support/apiFetchMock';
import { NotificationBell } from './NotificationBell';
import { NotificationsProvider } from './NotificationsProvider';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();

function renderBell(unreadCount: number) {
  mockApiByPath({
    [MY_EXAMS_PATH]: [],
    [NOTIFICATIONS_FEED_PATH]: { items: [], unreadCount },
  });
  return render(
    <MemoryRouter>
      <NotificationsProvider me={null}>
        <NotificationBell />
      </NotificationsProvider>
    </MemoryRouter>,
  );
}

describe('NotificationBell', () => {
  it('ноль новых — ссылка есть, имя «Уведомления», пилюли нет', async () => {
    renderBell(0);

    const link = await screen.findByRole('link', { name: 'Уведомления' });
    expect(link).toHaveAttribute('href', '/notifications');
    // Только значок — пилюля с нулём не рисуется (NotificationCount.tsx).
    expect(link).toHaveTextContent('');
  });

  it('три непрочитанных — имя «Уведомления, 3 новых», видимый текст «3»', async () => {
    renderBell(3);

    const link = await screen.findByRole('link', { name: 'Уведомления, 3 новых' });
    expect(link).toHaveTextContent('3');
  });

  it('двенадцать — видимый текст «9+», а имя называет настоящее «12»', async () => {
    renderBell(12);

    const link = await screen.findByRole('link', { name: 'Уведомления, 12 новых' });
    expect(link).toHaveTextContent('9+');
  });
});
