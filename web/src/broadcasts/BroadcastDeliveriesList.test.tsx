import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { BroadcastDto, ChannelDto, DeliveryDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { apiFetch } from '../api/http';
import { BroadcastDeliveriesList } from './BroadcastDeliveriesList';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

const mockedApiFetch = vi.mocked(apiFetch);

function makeChannel(overrides: Partial<ChannelDto> = {}): ChannelDto {
  return {
    id: 'ch1',
    type: 'vk',
    title: 'ВК школы',
    active: true,
    target: '1',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeBroadcast(overrides: Partial<BroadcastDto> = {}): BroadcastDto {
  return {
    id: 'b1',
    kind: 'manual',
    status: 'scheduled',
    text: 'Текст',
    scheduledAt: '2026-09-08T16:00:00Z',
    channelIds: ['ch1'],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function renderList(
  channelsById: Map<string, ChannelDto>,
  onDeliverySent = vi.fn().mockResolvedValue(undefined),
) {
  return render(
    <BroadcastDeliveriesList
      broadcastId="b1"
      broadcast={makeBroadcast()}
      channelsById={channelsById}
      onDeliverySent={onDeliverySent}
    />,
  );
}

describe('BroadcastDeliveriesList', () => {
  it('скелетон, пока грузится', () => {
    mockedApiFetch.mockReturnValue(new Promise(() => {}));
    const { container } = renderList(new Map());
    expect(container.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThan(0);
  });

  it('пусто — честное сообщение', async () => {
    mockedApiFetch.mockResolvedValueOnce([]);
    renderList(new Map());

    expect(await screen.findByText('Доставок пока нет.')).toBeInTheDocument();
  });

  it('доставки — название канала по channelId из channelsById, статус, без text от сервера', async () => {
    const delivery: DeliveryDto = {
      id: 'd1',
      broadcastId: 'b1',
      channelId: 'ch1',
      status: 'sent',
      attempts: 1,
    };
    mockedApiFetch.mockResolvedValueOnce([delivery]);
    const channelsById = new Map([['ch1', makeChannel()]]);
    renderList(channelsById);

    expect(await screen.findByText(/ВК школы · Отправлено/)).toBeInTheDocument();
  });

  it('доставка с каналом, которого нет в channelsById — тире вместо названия', async () => {
    const delivery: DeliveryDto = {
      id: 'd1',
      broadcastId: 'b1',
      channelId: 'ch-unknown',
      status: 'sent',
      attempts: 1,
    };
    mockedApiFetch.mockResolvedValueOnce([delivery]);
    renderList(new Map());

    expect(await screen.findByText(/— · Отправлено/)).toBeInTheDocument();
  });

  it('ApiError — LoadErrorBanner, «Попробовать ещё раз» перечитывает', async () => {
    const user = userEvent.setup();
    const { ApiError } = await import('../api/http');
    mockedApiFetch.mockRejectedValueOnce(
      new ApiError('Рассылка не найдена.', 404, 'not_found'),
    );
    renderList(new Map());

    expect(await screen.findByRole('alert')).toHaveTextContent('Рассылка не найдена.');

    mockedApiFetch.mockResolvedValueOnce([]);
    await user.click(screen.getByRole('button', { name: 'Попробовать ещё раз' }));

    expect(await screen.findByText('Доставок пока нет.')).toBeInTheDocument();
  });

  it('«Отметить отправленным» — композитный onSent зовёт и локальный reload, и onDeliverySent', async () => {
    const delivery: DeliveryDto = {
      id: 'd1',
      broadcastId: 'b1',
      channelId: 'ch1',
      status: 'manual',
      attempts: 0,
    };
    mockedApiFetch.mockResolvedValueOnce([delivery]);
    const channelsById = new Map([['ch1', makeChannel({ type: 'manual' })]]);
    const onDeliverySent = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderList(channelsById, onDeliverySent);
    const markButton = await screen.findByRole('button', {
      name: 'Отметить отправленным',
    });

    mockedApiFetch.mockResolvedValueOnce({});
    mockedApiFetch.mockResolvedValueOnce([{ ...delivery, status: 'sent' }]);
    await user.click(markButton);

    expect(mockedApiFetch).toHaveBeenCalledWith(
      '/deliveries/d1/mark-sent',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(onDeliverySent).toHaveBeenCalledTimes(1);
  });
});
