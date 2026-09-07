import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ChannelDto } from '@xuanxue/shared';
import type * as HttpModule from '../api/http';
import { apiFetch } from '../api/http';
import { ChannelCard } from './ChannelCard';

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
    target: '777',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function renderCard(
  overrides: Partial<ChannelDto> = {},
  onToggleActive: (active: boolean) => Promise<void> = vi
    .fn()
    .mockResolvedValue(undefined),
) {
  const onSelect = vi.fn();
  render(
    <ul>
      <ChannelCard
        channel={makeChannel(overrides)}
        onSelect={onSelect}
        onToggleActive={onToggleActive}
      />
    </ul>,
  );
  return { onSelect, onToggleActive };
}

describe('ChannelCard', () => {
  it('тип, название и target — открывает лист по клику', async () => {
    const user = userEvent.setup();
    const { onSelect } = renderCard();

    expect(screen.getByText('ВК · ВК школы')).toBeInTheDocument();
    expect(screen.getByText('777')).toBeInTheDocument();

    await user.click(screen.getByText('ВК · ВК школы'));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('без target — прочерк', () => {
    renderCard({ type: 'manual', target: '' });
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('webpush — карточка не открывает лист (кнопки нет, только текст)', async () => {
    const user = userEvent.setup();
    const { onSelect } = renderCard({ type: 'webpush', title: 'Push подписки' });

    const header = screen.getByText('Push · Push подписки');
    expect(header.closest('button')).not.toBeInTheDocument();

    await user.click(header);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('переключатель active — подпись с названием канала (ревью п.9), вызывает onToggleActive', async () => {
    const user = userEvent.setup();
    const { onToggleActive } = renderCard({ active: true, title: 'ВК школы' });

    await user.click(screen.getByLabelText('Включён — ВК школы'));
    expect(onToggleActive).toHaveBeenCalledWith(false);
  });

  it('сбой PATCH active — alert с текстом ошибки под карточкой, active не меняется', async () => {
    const user = userEvent.setup();
    const { ApiError } = await import('../api/http');
    const onToggleActive = vi
      .fn()
      .mockRejectedValue(new ApiError('Канал не найден.', 404, 'not_found'));
    renderCard({ active: true, title: 'ВК школы' }, onToggleActive);

    await user.click(screen.getByLabelText('Включён — ВК школы'));

    expect(await screen.findByRole('alert')).toHaveTextContent('Канал не найден.');
    expect(screen.getByLabelText('Включён — ВК школы')).toBeChecked();
  });

  it('во время PATCH active переключатель недоступен (pending)', async () => {
    const user = userEvent.setup();
    let resolveToggle: () => void = () => {};
    const onToggleActive = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveToggle = resolve;
        }),
    );
    renderCard({ active: true, title: 'ВК школы' }, onToggleActive);

    await user.click(screen.getByLabelText('Включён — ВК школы'));
    expect(screen.getByLabelText('Включён — ВК школы')).toBeDisabled();

    resolveToggle();
    await waitFor(() =>
      expect(screen.getByLabelText('Включён — ВК школы')).not.toBeDisabled(),
    );
  });

  it('«Проверить» — успех показывает текст результата, role=status', async () => {
    const user = userEvent.setup();
    mockedApiFetch.mockResolvedValueOnce({ status: 'sent' });
    renderCard();

    await user.click(screen.getByRole('button', { name: 'Проверить' }));

    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent('Тест доставлен');
  });

  it('«Проверить» — исход failed (200) показывает role=alert', async () => {
    const user = userEvent.setup();
    mockedApiFetch.mockResolvedValueOnce({ status: 'failed', error: 'Бот не в группе' });
    renderCard();

    await user.click(screen.getByRole('button', { name: 'Проверить' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Не доставлен: Бот не в группе');
  });

  it('«Проверить» — сбой сети показывает alert с текстом ошибки', async () => {
    const user = userEvent.setup();
    const { ApiError } = await import('../api/http');
    mockedApiFetch.mockRejectedValueOnce(
      new ApiError('Бот не в группе.', 502, 'unknown'),
    );
    renderCard();

    await user.click(screen.getByRole('button', { name: 'Проверить' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Бот не в группе.');
  });
});
