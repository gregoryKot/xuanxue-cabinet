// Тонкий экран (как StudentScreen.test.tsx) — здесь то, что рисует сам
// компонент (текст ожидания, опциональная ссылка на сайт школы), плюс
// перепроверка статуса при возврате на вкладку (ADR-0026 п.2, п.4 задачи —
// человек не должен застревать здесь до перезагрузки страницы).
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { MeDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { AuthProvider } from '../auth/AuthProvider';
import { mockedApiFetch, resetApiFetchBetweenTests } from '../test-support/apiFetchMock';
import { PendingApprovalScreen } from './PendingApprovalScreen';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();

const INVITED: MeDto = {
  id: 'u1',
  name: 'Ждущий',
  roles: [],
  tz: 'Asia/Jerusalem',
  status: 'invited',
};

function renderPending(config: Record<string, unknown>, me: MeDto = INVITED) {
  mockedApiFetch.mockImplementation((path: string) => {
    if (path === '/auth/me') return Promise.resolve(me);
    if (path === '/auth/config') return Promise.resolve(config);
    return Promise.reject(new Error(`неожиданный путь: ${path}`));
  });
  return render(
    <AuthProvider>
      <PendingApprovalScreen />
    </AuthProvider>,
  );
}

describe('PendingApprovalScreen', () => {
  it('заголовок и текст ожидания', async () => {
    renderPending({});
    expect(
      screen.getByRole('heading', { name: 'Ждём подтверждения' }),
    ).toBeInTheDocument();
    expect(await screen.findByText(/Учитель откроет доступ/)).toBeInTheDocument();
  });

  it('учитель заполнил адрес сайта школы — ссылка на экране', async () => {
    renderPending({ schoolSiteUrl: 'https://xuanxue.su' });

    expect(
      await screen.findByRole('link', { name: 'https://xuanxue.su' }),
    ).toHaveAttribute('href', 'https://xuanxue.su');
  });

  it('без адреса сайта школы — без ссылки', async () => {
    renderPending({});

    await screen.findByText(/Учитель откроет доступ/);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('возврат на вкладку — перепроверяет /auth/me, не опрашивает по таймеру', async () => {
    renderPending({});
    await screen.findByText(/Учитель откроет доступ/);
    mockedApiFetch.mockClear();

    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
    });
    document.dispatchEvent(new Event('visibilitychange'));

    await waitFor(() => expect(mockedApiFetch).toHaveBeenCalledWith('/auth/me'));
    // Один вызов на одно событие — не цикл опроса.
    expect(mockedApiFetch).toHaveBeenCalledTimes(1);
  });

  it('вкладка скрылась — /auth/me не перезапрашивается', async () => {
    renderPending({});
    await screen.findByText(/Учитель откроет доступ/);
    mockedApiFetch.mockClear();

    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden',
      configurable: true,
    });
    document.dispatchEvent(new Event('visibilitychange'));

    expect(mockedApiFetch).not.toHaveBeenCalled();
  });
});
