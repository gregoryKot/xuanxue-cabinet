// Строка канала в списке: что видно и что открывается по нажатию (ADR-0033).
// Переключатель `active` и «Проверить» здесь больше не живут — они на
// странице канала (ChannelEditorScreen.test.tsx).
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ChannelDto } from '@xuanxue/shared';
import { ChannelCard } from './ChannelCard';

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

function renderCard(overrides: Partial<ChannelDto> = {}) {
  const onSelect = vi.fn();
  render(
    <ul>
      <ChannelCard channel={makeChannel(overrides)} onSelect={onSelect} />
    </ul>,
  );
  return { onSelect };
}

describe('ChannelCard', () => {
  it('тип, название и адрес — открывает страницу канала по нажатию', async () => {
    const user = userEvent.setup();
    const { onSelect } = renderCard();

    expect(screen.getByText('ВК · ВК школы')).toBeInTheDocument();
    expect(screen.getByText('777')).toBeInTheDocument();

    await user.click(screen.getByText('ВК · ВК школы'));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('без адреса — прочерк', () => {
    renderCard({ type: 'manual', target: '' });
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('выключенный канал подписан в строке', () => {
    renderCard({ active: false });
    expect(screen.getByText('777 · Выключен')).toBeInTheDocument();
  });

  it('включённый канал подписи «Выключен» не несёт', () => {
    renderCard({ active: true });
    expect(screen.queryByText(/Выключен/)).not.toBeInTheDocument();
  });

  it('webpush — строка никуда не ведёт (кнопки нет, только текст)', async () => {
    const user = userEvent.setup();
    const { onSelect } = renderCard({ type: 'webpush', title: 'Push подписки' });

    const header = screen.getByText('Push · Push подписки');
    expect(header.closest('button')).not.toBeInTheDocument();

    await user.click(header);
    expect(onSelect).not.toHaveBeenCalled();
  });
});
