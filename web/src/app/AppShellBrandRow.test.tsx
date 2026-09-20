// Строка «знак школы + название» без боковой колонки (AppShell.tsx) — на
// телефоне вместо имени человека стоят значки колокольчика (ADR-0065) и
// профиля (ADR-0045). На мониторе (боковой колонки у ученика не бывает, но
// это не телефон) — только знак и название, без ссылок: там эту роль играет
// подвал под содержимым. Колокольчик ходит в сеть через NotificationsProvider
// — мокаем apiFetch тем же приёмом, что useNotificationsData.test.ts.
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { MY_EXAMS_PATH, NOTIFICATIONS_FEED_PATH } from '../api/apiPaths';
import type * as HttpModule from '../api/http';
import { mockApiByPath, resetApiFetchBetweenTests } from '../test-support/apiFetchMock';
import { NotificationsProvider } from '../notifications/NotificationsProvider';
import { AppShellBrandRow } from './AppShellBrandRow';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();

function renderRow(isMobile: boolean) {
  mockApiByPath({
    [MY_EXAMS_PATH]: [],
    [NOTIFICATIONS_FEED_PATH]: { items: [], unreadCount: 0 },
  });
  return render(
    <MemoryRouter>
      <NotificationsProvider me={null}>
        <AppShellBrandRow isMobile={isMobile} />
      </NotificationsProvider>
    </MemoryRouter>,
  );
}

describe('AppShellBrandRow', () => {
  it('знак и название видны в обоих видах', async () => {
    renderRow(false);
    expect(await screen.findByText('Школа Сюань-Сюэ')).toBeInTheDocument();
  });

  it('телефон — значок профиля ведёт на «Профиль», имени человека в строке нет', async () => {
    renderRow(true);

    const link = await screen.findByRole('link', { name: 'Профиль' });
    expect(link).toHaveAttribute('href', '/profile');
    // Имя человека здесь больше не показывается (отзыв владельца 2026-09-18)
    // — только значок, названный aria-label ссылки.
    expect(link).toHaveTextContent('');
  });

  it('телефон — значок колокольчика ведёт на «Уведомления», слева от профиля', async () => {
    renderRow(true);

    const link = await screen.findByRole('link', { name: 'Уведомления' });
    expect(link).toHaveAttribute('href', '/notifications');
  });

  it('монитор (ученик без боковой колонки) — ссылок нет, это подвал под содержимым', async () => {
    renderRow(false);
    await screen.findByText('Школа Сюань-Сюэ');

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
