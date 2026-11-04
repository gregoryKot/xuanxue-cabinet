import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ChannelDto } from '@xuanxue/shared';
import { ChannelPicker } from './ChannelPicker';

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

function renderPicker(channels: ChannelDto[], selectedIds: string[] = []) {
  const onChange = vi.fn();
  render(
    <ChannelPicker
      legend="Каналы"
      channels={channels}
      selectedIds={selectedIds}
      onChange={onChange}
      emptyMessage="Каналов нет."
    />,
  );
  return { onChange };
}

describe('ChannelPicker', () => {
  it('пустой список — emptyMessage вместо чекбоксов', () => {
    renderPicker([]);
    expect(screen.getByText('Каналов нет.')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('список — подпись «тип · название», отмечен только выбранный', () => {
    renderPicker(
      [
        makeChannel({ id: 'ch1' }),
        makeChannel({ id: 'ch2', type: 'manual', title: 'Facebook' }),
      ],
      ['ch1'],
    );

    expect(screen.getByLabelText('ВК · ВК школы')).toBeChecked();
    expect(screen.getByLabelText('Вручную · Facebook')).not.toBeChecked();
  });

  it('отметка добавляет id, снятие убирает', async () => {
    const user = userEvent.setup();
    const { onChange } = renderPicker([makeChannel({ id: 'ch1' })], []);

    await user.click(screen.getByLabelText('ВК · ВК школы'));
    expect(onChange).toHaveBeenCalledWith(['ch1']);
  });
});
