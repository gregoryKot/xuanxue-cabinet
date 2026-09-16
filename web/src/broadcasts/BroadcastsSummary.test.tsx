// Мокаем apiFetch (CLAUDE.md «Сеть только через http.ts») — блок сам зовёт
// useSummary(), поэтому проверяем его целиком: загрузка, сбой, пустая база,
// числа.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SummaryDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { apiFetch } from '../api/http';
import { BroadcastsSummary } from './BroadcastsSummary';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

const mockedApiFetch = vi.mocked(apiFetch);

const SUMMARY: SummaryDto = {
  period: { from: '2026-08-08T00:00:00Z', to: '2026-09-07T00:00:00Z' },
  broadcastsSent: 12,
  broadcastsCancelled: 5,
  deliveriesFailed: 1,
  deliveriesPending: 2,
  manualWaiting: 3,
};

afterEach(() => {
  mockedApiFetch.mockReset();
});

describe('BroadcastsSummary — загрузка', () => {
  it('показывает скелетон, пока сводка не пришла', () => {
    mockedApiFetch.mockReturnValue(new Promise(() => {}));
    const { container } = render(<BroadcastsSummary />, { wrapper: MemoryRouter });
    expect(container.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThan(0);
  });
});

describe('BroadcastsSummary — сбой загрузки', () => {
  it('ApiError — текст и «Попробовать ещё раз», клик повторяет запрос', async () => {
    const user = userEvent.setup();
    const { ApiError } = await import('../api/http');
    mockedApiFetch.mockRejectedValueOnce(
      new ApiError('Сервис недоступен', 503, 'unknown'),
    );

    render(<BroadcastsSummary />, { wrapper: MemoryRouter });

    expect(await screen.findByRole('alert')).toHaveTextContent('Сервис недоступен');

    mockedApiFetch.mockResolvedValueOnce({
      ...SUMMARY,
      emptyMessage: 'Пока рассылок не было.',
    });
    await user.click(screen.getByRole('button', { name: 'Попробовать ещё раз' }));

    expect(await screen.findByText('Пока рассылок не было.')).toBeInTheDocument();
  });
});

describe('BroadcastsSummary — пустая база', () => {
  it('честное emptyMessage вместо чисел', async () => {
    mockedApiFetch.mockResolvedValueOnce({
      ...SUMMARY,
      emptyMessage: 'Пока нечего показать.',
    });

    render(<BroadcastsSummary />, { wrapper: MemoryRouter });

    expect(await screen.findByText('Пока нечего показать.')).toBeInTheDocument();
    expect(screen.queryByText('Рассылок отправлено')).not.toBeInTheDocument();
  });
});

describe('BroadcastsSummary — числа за период', () => {
  it('числа строкой, отмены — ссылка в журнал с фильтром', async () => {
    mockedApiFetch.mockResolvedValueOnce(SUMMARY);

    render(<BroadcastsSummary />, { wrapper: MemoryRouter });

    expect(await screen.findByText('12')).toBeInTheDocument();
    expect(screen.getByText('За 30 дней')).toBeInTheDocument();
    expect(screen.getByText('Ждут отправки вручную').closest('a')).toBeNull();
    expect(screen.getByText('Отменено автоматикой').closest('a')).toHaveAttribute(
      'href',
      '/broadcasts?status=cancelled',
    );
  });
});
