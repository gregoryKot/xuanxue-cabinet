// Тонкий экран (как StudentScreen.test.tsx) — здесь только то, что рисует
// сам компонент: текст ожидания и опциональная ссылка на сайт школы.
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type * as HttpModule from '../api/http';
import { mockApiByPath, resetApiFetchBetweenTests } from '../test-support/apiFetchMock';
import { PendingApprovalScreen } from './PendingApprovalScreen';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

resetApiFetchBetweenTests();

function renderPending(config: Record<string, unknown>) {
  mockApiByPath({ '/auth/config': config });
  return render(<PendingApprovalScreen />);
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
});
