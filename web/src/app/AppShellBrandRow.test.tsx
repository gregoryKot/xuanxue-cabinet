// Строка «знак школы + название» без боковой колонки (AppShell.tsx) — на
// телефоне вместо имени человека стоят значки колокольчика (ADR-0063) и
// профиля (ADR-0045). Знак с названием — сама ссылка на главную
// (SchoolBrandLink.tsx) в обоих видах, колокольчик и профиль — свои
// отдельные ссылки и рисуются только на телефоне: на мониторе эту роль
// по-прежнему играет подвал под содержимым. Колокольчик ходит в сеть через
// NotificationsProvider — мокаем apiFetch тем же приёмом, что
// useNotificationsData.test.ts.
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { MeDto } from '@xuanxue/shared';
import { MY_EXAMS_PATH, NOTIFICATIONS_FEED_PATH } from '../api/apiPaths';
import type * as HttpModule from '../api/http';
import { mockApiByPath, resetApiFetchBetweenTests } from '../test-support/apiFetchMock';
import { NotificationsProvider } from '../notifications/NotificationsProvider';
import { MyExamsProvider } from '../student/MyExamsProvider';
import { AppShellBrandRow } from './AppShellBrandRow';
import { rootPathFor } from './screenAccess';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();

const TEACHER: MeDto = {
  id: 'u1',
  name: 'Дима',
  roles: ['teacher'],
  status: 'active',
  telegramLinked: false,
  botChatActive: false,
  noTelegram: false,
  hasEmail: true,
  needsProfile: false,
};

function renderRow(isMobile: boolean, me: MeDto | null = null) {
  mockApiByPath({
    [MY_EXAMS_PATH]: [],
    [NOTIFICATIONS_FEED_PATH]: { items: [], unreadCount: 0 },
  });
  return render(
    <MemoryRouter>
      <MyExamsProvider me={me}>
        <NotificationsProvider me={me}>
          <AppShellBrandRow isMobile={isMobile} me={me} />
        </NotificationsProvider>
      </MyExamsProvider>
    </MemoryRouter>,
  );
}

describe('AppShellBrandRow', () => {
  it('знак и название видны в обоих видах', async () => {
    renderRow(false);
    expect(await screen.findByText('Школа Сюань-Сюэ')).toBeInTheDocument();
  });

  // Знак — ссылка на главную (SchoolBrandLink.tsx), адрес — общее правило
  // rootPathFor (screenAccess.ts), то же самое, что использует AppNav.tsx.
  it('знак с названием ведёт на главную', async () => {
    renderRow(true, TEACHER);

    const link = await screen.findByRole('link', { name: 'Школа Сюань-Сюэ' });
    expect(link).toHaveAttribute('href', rootPathFor(TEACHER));
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

  // Знак стал ссылкой — гейт от регресса «одна ссылка на троих»: колокольчик
  // и «Профиль» обязаны остаться отдельными целями нажатия рядом с ним, не
  // слиться в знак или друг в друга.
  it('колокольчик и «Профиль» остаются отдельными ссылками рядом со знаком', async () => {
    renderRow(true, TEACHER);
    await screen.findByRole('link', { name: 'Школа Сюань-Сюэ' });

    expect(screen.getByRole('link', { name: 'Уведомления' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Профиль' })).toBeInTheDocument();
    expect(screen.getAllByRole('link')).toHaveLength(3);
  });

  // Раньше на мониторе ссылок не было вовсе — теперь знак сам стал ссылкой
  // (SchoolBrandLink.tsx). Колокольчик и профиль на мониторе по-прежнему не
  // рисуются (эту роль там играет подвал под содержимым, AppShell.tsx), так
  // что единственная ссылка строки — знак.
  it('монитор — единственная ссылка это знак с названием', async () => {
    renderRow(false);
    await screen.findByText('Школа Сюань-Сюэ');

    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAccessibleName('Школа Сюань-Сюэ');
  });
});
