// Данные приходят пропсом (pr-k3-fixes.md п.7) — `useManualDeliveries()`
// теперь в BroadcastsScreen, здесь мокаем apiFetch только для «Отметить
// отправленным» (useMarkSent зовёт его напрямую).
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ChannelDto, DeliveryDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { apiFetch } from '../api/http';
import { ManualDeliveriesSection } from './ManualDeliveriesSection';

vi.mock('../api/http', async () => {
  const actual = await vi.importActual<typeof HttpModule>('../api/http');
  return { ...actual, apiFetch: vi.fn() };
});

const mockedApiFetch = vi.mocked(apiFetch);

function makeChannel(overrides: Partial<ChannelDto> = {}): ChannelDto {
  return {
    id: 'ch1',
    type: 'manual',
    title: 'Facebook',
    active: true,
    target: '',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

const DELIVERY: DeliveryDto = {
  id: 'd1',
  broadcastId: 'b1',
  channelId: 'ch1',
  status: 'manual',
  attempts: 0,
};

describe('ManualDeliveriesSection', () => {
  it('loading=true — скелетон, без заголовка', () => {
    render(
      <ManualDeliveriesSection
        deliveries={null}
        loading
        error={null}
        onRetry={vi.fn()}
        channelsById={new Map()}
        onSent={vi.fn()}
      />,
    );

    expect(screen.queryByText('Ждут отправки вручную')).not.toBeInTheDocument();
  });

  it('пустой список — секции нет вовсе', () => {
    render(
      <ManualDeliveriesSection
        deliveries={[]}
        loading={false}
        error={null}
        onRetry={vi.fn()}
        channelsById={new Map()}
        onSent={vi.fn()}
      />,
    );

    expect(screen.queryByText('Ждут отправки вручную')).not.toBeInTheDocument();
  });

  it('есть доставки — заголовок и карточка с якорем #manual', async () => {
    const user = userEvent.setup();
    mockedApiFetch.mockResolvedValueOnce({});
    const onSent = vi.fn().mockResolvedValue(undefined);
    const channelsById = new Map([['ch1', makeChannel()]]);
    const { container } = render(
      <ManualDeliveriesSection
        deliveries={[DELIVERY]}
        loading={false}
        error={null}
        onRetry={vi.fn()}
        channelsById={channelsById}
        onSent={onSent}
      />,
    );

    expect(screen.getByText('Ждут отправки вручную')).toBeInTheDocument();
    expect(container.querySelector('#manual')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Отметить отправленным' }));

    expect(mockedApiFetch).toHaveBeenCalledWith(
      '/deliveries/d1/mark-sent',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(onSent).toHaveBeenCalledTimes(1);
  });

  it('доставка с каналом, которого нет в channelsById — тире вместо названия', () => {
    render(
      <ManualDeliveriesSection
        deliveries={[{ ...DELIVERY, channelId: 'ch-unknown' }]}
        loading={false}
        error={null}
        onRetry={vi.fn()}
        channelsById={new Map()}
        onSent={vi.fn()}
      />,
    );

    expect(screen.getByText(/— · Ждёт вас/)).toBeInTheDocument();
  });

  it('ApiError — LoadErrorBanner с повтором, зовёт onRetry', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(
      <ManualDeliveriesSection
        deliveries={null}
        loading={false}
        error="Сервис недоступен"
        onRetry={onRetry}
        channelsById={new Map()}
        onSent={vi.fn()}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Сервис недоступен');
    await user.click(screen.getByRole('button', { name: 'Попробовать ещё раз' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
