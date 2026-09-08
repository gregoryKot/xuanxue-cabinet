import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as HttpModule from '../api/http';
import { apiFetch } from '../api/http';
import SummaryScreen from './SummaryScreen';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

const mockedApiFetch = vi.mocked(apiFetch);

function renderScreen() {
  return render(
    <MemoryRouter>
      <SummaryScreen />
    </MemoryRouter>,
  );
}

afterEach(() => {
  mockedApiFetch.mockReset();
});

describe('SummaryScreen — загрузка', () => {
  it('показывает скелетон, пока сводка не пришла', () => {
    mockedApiFetch.mockReturnValue(new Promise(() => {}));
    const { container } = renderScreen();
    expect(container.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThan(0);
  });
});

describe('SummaryScreen — сбой загрузки', () => {
  it('ApiError — текст и «Попробовать ещё раз», клик повторяет запрос', async () => {
    const user = userEvent.setup();
    const { ApiError } = await import('../api/http');
    mockedApiFetch.mockRejectedValueOnce(
      new ApiError('Сервис недоступен', 503, 'unknown'),
    );

    renderScreen();

    expect(await screen.findByRole('alert')).toHaveTextContent('Сервис недоступен');
    mockedApiFetch.mockResolvedValueOnce({
      period: { from: '2026-08-08T00:00:00Z', to: '2026-09-07T00:00:00Z' },
      broadcastsSent: 0,
      broadcastsCancelled: 0,
      deliveriesFailed: 0,
      deliveriesPending: 0,
      manualWaiting: 0,
      emptyMessage: 'Пока рассылок не было.',
    });
    await user.click(screen.getByRole('button', { name: 'Попробовать ещё раз' }));

    expect(await screen.findByText('Пока рассылок не было.')).toBeInTheDocument();
  });
});

describe('SummaryScreen — пустая база', () => {
  it('honest emptyMessage вместо карточек', async () => {
    mockedApiFetch.mockResolvedValue({
      period: { from: '2026-08-08T00:00:00Z', to: '2026-09-07T00:00:00Z' },
      broadcastsSent: 0,
      broadcastsCancelled: 0,
      deliveriesFailed: 0,
      deliveriesPending: 0,
      manualWaiting: 0,
      emptyMessage: 'Пока нечего показать.',
    });

    renderScreen();

    expect(await screen.findByText('Пока нечего показать.')).toBeInTheDocument();
    expect(screen.queryByText('Рассылок отправлено')).not.toBeInTheDocument();
  });
});

describe('SummaryScreen — числа и ближайшее занятие', () => {
  it('карточки со значениями, ручные доставки без ссылки (маршрут появится в K3), ссылка на «Планирование»', async () => {
    mockedApiFetch.mockResolvedValue({
      period: { from: '2026-08-08T00:00:00Z', to: '2026-09-07T00:00:00Z' },
      broadcastsSent: 12,
      broadcastsCancelled: 5,
      deliveriesFailed: 1,
      deliveriesPending: 2,
      manualWaiting: 3,
      nextLesson: {
        lessonId: 'l1',
        title: 'Тайцзицюань, средняя группа',
        startsAt: '2026-09-08T16:00:00Z',
      },
    });

    renderScreen();

    expect(await screen.findByText('12')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    const manualCard = screen.getByText('Ждут отправки вручную');
    expect(manualCard.closest('a')).toBeNull();
    const lessonLink = screen.getByText(/Ближайшее занятие — Тайцзицюань/).closest('a');
    expect(lessonLink).toHaveAttribute('href', '/planning#lesson-l1');
    const cancelledLink = screen.getByText('Отменено автоматикой').closest('a');
    expect(cancelledLink).toHaveAttribute('href', '/broadcasts?status=cancelled');
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('без ближайшего занятия — карточка не рендерится', async () => {
    mockedApiFetch.mockResolvedValue({
      period: { from: '2026-08-08T00:00:00Z', to: '2026-09-07T00:00:00Z' },
      broadcastsSent: 1,
      broadcastsCancelled: 0,
      deliveriesFailed: 0,
      deliveriesPending: 0,
      manualWaiting: 0,
    });

    renderScreen();

    await screen.findByText('Рассылок отправлено');
    expect(screen.queryByText(/Ближайшее занятие/)).not.toBeInTheDocument();
  });
});
