// BroadcastCard напрямую — по образцу channels/ChannelCard.test.tsx.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { BroadcastDto, ChannelDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { ApiError, apiFetch } from '../api/http';
import { stubViewerTimeZone } from '../test-support/viewerTimeZone';
import { BroadcastCard } from './BroadcastCard';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

const mockedApiFetch = vi.mocked(apiFetch);

// «Пояс школы отличается от браузерного» ниже — проверяемое условие, а не
// везение: пояс зрителя задан явно (test-support/viewerTimeZone.ts).
stubViewerTimeZone();

function makeBroadcast(overrides: Partial<BroadcastDto> = {}): BroadcastDto {
  return {
    id: 'b1',
    kind: 'manual',
    status: 'scheduled',
    text: 'строка1\nстрока2\nстрока3',
    scheduledAt: '2026-09-08T16:00:00Z',
    channelIds: ['ch1'],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function renderCard(overrides: Partial<BroadcastDto> = {}, schoolTz?: string) {
  const onCancel = vi.fn().mockResolvedValue(undefined);
  const onDeliverySent = vi.fn().mockResolvedValue(undefined);
  const channelsById = new Map<string, ChannelDto>();
  render(
    <MemoryRouter initialEntries={['/hub', '/broadcasts']} initialIndex={1}>
      <ul>
        <BroadcastCard
          broadcast={makeBroadcast(overrides)}
          channelsById={channelsById}
          onCancel={onCancel}
          onDeliverySent={onDeliverySent}
          schoolTz={schoolTz}
        />
      </ul>
    </MemoryRouter>,
  );
  return { onCancel, onDeliverySent };
}

describe('BroadcastCard', () => {
  it('время, вид, статус и первые 2 строки текста', () => {
    renderCard();

    expect(screen.getByText(/Разовая рассылка/)).toBeInTheDocument();
    expect(screen.getByText(/Ждёт отправки/)).toBeInTheDocument();
    expect(
      screen.getByText((_, el) => el?.textContent === 'строка1\nстрока2'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/строка3/)).not.toBeInTheDocument();
  });

  it('пояс школы отличается от браузерного — бейдж рядом со временем (pr-k3-fixes.md п.22)', () => {
    renderCard({}, 'Pacific/Auckland');
    expect(screen.getByText(/Pacific\/Auckland/)).toBeInTheDocument();
  });

  it('schoolTz не передан — бейджа нет', () => {
    renderCard();
    expect(screen.queryByText(/Pacific\/Auckland/)).not.toBeInTheDocument();
  });

  it('«Раскрыть» — aria-expanded/aria-controls, показывает доставки; «Свернуть» их убирает', async () => {
    const user = userEvent.setup();
    mockedApiFetch.mockResolvedValueOnce([]);
    renderCard();

    const toggle = screen.getByRole('button', { name: 'Раскрыть' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    const controlsId = toggle.getAttribute('aria-controls');
    expect(controlsId).toBeTruthy();

    await user.click(toggle);
    expect(mockedApiFetch).toHaveBeenCalledWith(
      '/broadcasts/b1/deliveries',
      expect.anything(),
    );
    const collapse = await screen.findByRole('button', { name: 'Свернуть' });
    expect(collapse).toHaveAttribute('aria-expanded', 'true');
    expect(document.getElementById(controlsId as string)).toBeInTheDocument();

    await user.click(collapse);
    expect(screen.queryByText('Доставок пока нет.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Раскрыть' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('scheduled — кнопка «Отменить» есть, sent — нет', () => {
    renderCard({ status: 'sent' });
    expect(screen.queryByRole('button', { name: 'Отменить' })).not.toBeInTheDocument();
  });

  it('подтверждение и успешная отмена — зовёт onCancel', async () => {
    const user = userEvent.setup();
    const { onCancel } = renderCard();

    await user.click(screen.getByRole('button', { name: 'Отменить' }));
    expect(
      screen.getByRole('dialog', { name: 'Отменить рассылку?' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Рассылка не уйдёт ни в один канал.', { exact: false }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Отменить рассылку' }));

    expect(onCancel).toHaveBeenCalledWith('b1');
  });

  it('сбой отмены — текст ошибки на карточке', async () => {
    const user = userEvent.setup();
    const onCancel = vi
      .fn()
      .mockRejectedValue(new ApiError('Уже отправлено.', 409, 'conflict'));
    const onDeliverySent = vi.fn().mockResolvedValue(undefined);
    const channelsById = new Map<string, ChannelDto>();
    render(
      <MemoryRouter initialEntries={['/hub', '/broadcasts']} initialIndex={1}>
        <ul>
          <BroadcastCard
            broadcast={makeBroadcast()}
            channelsById={channelsById}
            onCancel={onCancel}
            onDeliverySent={onDeliverySent}
          />
        </ul>
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: 'Отменить' }));
    await user.click(screen.getByRole('button', { name: 'Отменить рассылку' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Уже отправлено.');
  });
});
