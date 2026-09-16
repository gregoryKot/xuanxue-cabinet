import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { MeDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { ApiError } from '../api/http';
import { mockedApiFetch, resetApiFetchBetweenTests } from '../test-support/apiFetchMock';
import { AuthProvider } from '../auth/AuthProvider';
import NotificationsScreen from './NotificationsScreen';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();

const STUDENT: MeDto = {
  id: 'u1',
  name: 'Ученик',
  roles: [],
  tz: 'Asia/Jerusalem',
  status: 'active',
  telegramLinked: false,
};

function renderScreen(me: MeDto, notificationsResponse: unknown = { enabled: [] }) {
  mockedApiFetch.mockImplementation((path: string) => {
    if (path === '/auth/me') return Promise.resolve(me);
    if (path === '/auth/config') return Promise.resolve({});
    if (path === '/me/notifications') {
      return notificationsResponse instanceof Error
        ? Promise.reject(notificationsResponse)
        : Promise.resolve(notificationsResponse);
    }
    return Promise.reject(new Error(`неожиданный путь: ${path}`));
  });

  return render(
    <MemoryRouter>
      <AuthProvider>
        <NotificationsScreen />
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('NotificationsScreen — шапка', () => {
  // ADR-0031: экран начинался прямо с абзаца, без заголовка раздела.
  it('заголовок «Уведомления» и объяснение под ним', async () => {
    renderScreen(STUDENT);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Уведомления' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Здесь вы решаете, что вам приходит/)).toBeInTheDocument();
  });
});

describe('NotificationsScreen — список по роли', () => {
  it('ученик видит свои два вида уведомлений с подписью и подсказкой', async () => {
    renderScreen(STUDENT, { enabled: ['lesson_soon'] });

    expect(await screen.findByText('Занятие скоро')).toBeInTheDocument();
    expect(screen.getByText('Сообщение от учителя')).toBeInTheDocument();
    expect(
      screen.getByText('Придёт перед началом занятия — за сколько, настраивает школа.'),
    ).toBeInTheDocument();
    // «Черновик поста» — вид для учителя, ученику его показывать незачем.
    expect(screen.queryByText('Черновик поста')).not.toBeInTheDocument();
  });

  it('включённый вид — переключатель отмечен, выключенный — нет', async () => {
    renderScreen(STUDENT, { enabled: ['lesson_soon'] });
    await screen.findByText('Занятие скоро');

    expect(screen.getByRole('checkbox', { name: 'Занятие скоро' })).toBeChecked();
    expect(
      screen.getByRole('checkbox', { name: 'Сообщение от учителя' }),
    ).not.toBeChecked();
  });

  it('честно про Telegram — уведомления придут в личный чат с ботом', async () => {
    renderScreen(STUDENT, { enabled: [] });

    expect(
      await screen.findByText(/В Telegram уведомления приходят в личный чат с ботом/),
    ).toBeInTheDocument();
  });
});

describe('NotificationsScreen — переключение (read-after-write)', () => {
  it('клик шлёт PATCH с нужным телом и перерисовывает состояние', async () => {
    renderScreen(STUDENT, { enabled: [] });
    const toggle = await screen.findByRole('checkbox', { name: 'Занятие скоро' });
    expect(toggle).not.toBeChecked();

    mockedApiFetch.mockResolvedValueOnce(undefined);
    mockedApiFetch.mockResolvedValueOnce({ enabled: ['lesson_soon'] });
    toggle.click();

    await waitFor(() => expect(toggle).toBeChecked());
    expect(mockedApiFetch).toHaveBeenCalledWith(
      '/me/notifications',
      expect.objectContaining({
        method: 'PATCH',
        body: { kind: 'lesson_soon', enabled: true },
      }),
    );
  });

  it('ошибка сети — сообщение под списком, переключатель остаётся в прежнем положении', async () => {
    renderScreen(STUDENT, { enabled: [] });
    const toggle = await screen.findByRole('checkbox', { name: 'Занятие скоро' });

    mockedApiFetch.mockRejectedValueOnce(
      new ApiError(
        'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.',
        0,
        'network',
      ),
    );
    toggle.click();

    expect(
      await screen.findByText(
        'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.',
      ),
    ).toBeInTheDocument();
    expect(toggle).not.toBeChecked();
  });

  it('неопознанная ошибка (не ApiError) — общий текст, не текст исключения', async () => {
    renderScreen(STUDENT, { enabled: [] });
    const toggle = await screen.findByRole('checkbox', { name: 'Занятие скоро' });

    mockedApiFetch.mockRejectedValueOnce(new Error('boom'));
    toggle.click();

    expect(
      await screen.findByText('Не удалось изменить уведомление. Попробуйте ещё раз.'),
    ).toBeInTheDocument();
  });
});

describe('NotificationsScreen — ошибка загрузки', () => {
  it('баннер с кнопкой повтора вместо списка, повтор перечитывает список', async () => {
    mockedApiFetch.mockImplementation((path: string) => {
      if (path === '/auth/me') return Promise.resolve(STUDENT);
      if (path === '/auth/config') return Promise.resolve({});
      if (path === '/me/notifications')
        return Promise.reject(new Error('сеть недоступна'));
      return Promise.reject(new Error(`неожиданный путь: ${path}`));
    });
    render(
      <MemoryRouter>
        <AuthProvider>
          <NotificationsScreen />
        </AuthProvider>
      </MemoryRouter>,
    );

    const alert = await screen.findByRole('alert');
    const retryButton = within(alert).getByRole('button', {
      name: 'Попробовать ещё раз',
    });

    mockedApiFetch.mockImplementationOnce(() => Promise.resolve({ enabled: [] }));
    retryButton.click();

    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(await screen.findByText('Занятие скоро')).toBeInTheDocument();
  });
});
