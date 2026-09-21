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
    expect(screen.queryByText('Ушло за 30 дней')).not.toBeInTheDocument();
  });
});

describe('BroadcastsSummary — числа за период', () => {
  it('карточки: ушло, ждут, не отправилось — последнее красным', async () => {
    mockedApiFetch.mockResolvedValueOnce(SUMMARY);

    render(<BroadcastsSummary />, { wrapper: MemoryRouter });

    expect(await screen.findByText('12')).toBeInTheDocument();
    expect(screen.getByText('Ушло за 30 дней')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('Ждут отправки')).toBeInTheDocument();
    expect(screen.getByText('1').style.color).toBe('var(--danger)');
    expect(screen.getByText('Не отправилось')).toBeInTheDocument();
    // «Ждут отправки вручную» из сводки ушло — его теперь считает сама плашка
    // ManualDeliveriesSection.tsx, рядом со списком (docs/adr/0043).
    expect(screen.queryByText(/Ждут отправки вручную/)).not.toBeInTheDocument();
  });

  // Макет рисует три карточки, но отменённая автоматикой рассылка — это
  // несостоявшаяся отправка, тот самый тихий отказ, который CLAUDE.md зовёт
  // самой дорогой ошибкой в продукте про рассылки. Журнал по такому фильтру
  // больше ниоткуда не открывается, поэтому число и ссылка остаются. Тест
  // держит их на месте: пропадут — упадёт здесь, а не у учителя на экране.
  it('«Отменено автоматикой» — четвёртой карточкой и ведёт в журнал с фильтром', async () => {
    mockedApiFetch.mockResolvedValueOnce(SUMMARY);

    render(<BroadcastsSummary />, { wrapper: MemoryRouter });

    await screen.findByText('12');
    expect(screen.getByText('Отменено автоматикой')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Отменено автоматикой/ })).toHaveAttribute(
      'href',
      '/broadcasts?status=cancelled',
    );
  });

  // Владелец по снимку: «подчёркивания, нужны?». Линия снизу в кабинете
  // помечает текстовую ссылку в потоке содержимого, а здесь кликается вся
  // карточка — в ряду одинаковых на вид плиток линия под одной подписью
  // читалась опечаткой (docs/adr/0098). Вместо неё знак «›», и он
  // декоративный: доступное имя ссылки даёт подпись.
  it('подпись карточки-ссылки без линии снизу, а знак «›» не попадает в имя ссылки', async () => {
    mockedApiFetch.mockResolvedValueOnce(SUMMARY);

    render(<BroadcastsSummary />, { wrapper: MemoryRouter });

    const label = await screen.findByText('Отменено автоматикой');
    expect(label.style.borderBottom).toBe('');
    // Точное имя, не подстрока: так видно, что «›» в него не попал. Число в
    // имени есть — ссылкой сделана вся карточка, а не одна подпись.
    expect(
      screen.getByRole('link', {
        name: `${SUMMARY.broadcastsCancelled}Отменено автоматикой`,
      }),
    ).toBeInTheDocument();
  });
});
