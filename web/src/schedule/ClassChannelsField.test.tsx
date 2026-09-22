import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { ChannelDto } from '@xuanxue/shared';
import { ClassChannelsField } from './ClassChannelsField';

function makeChannel(overrides: Partial<ChannelDto> = {}): ChannelDto {
  return {
    id: 'ch1',
    type: 'vk',
    title: 'ВК школы',
    active: true,
    target: '777',
    tags: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function renderField(channels: ChannelDto[], selectedIds: string[] = []) {
  const onChange = vi.fn();
  render(
    <MemoryRouter>
      <ClassChannelsField
        channels={channels}
        selectedIds={selectedIds}
        onChange={onChange}
      />
    </MemoryRouter>,
  );
  return { onChange };
}

describe('ClassChannelsField', () => {
  it('нет ни одного канала — подсказка со ссылкой на «Каналы», чекбоксов нет', () => {
    renderField([]);

    expect(screen.getByText(/Каналов пока нет/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '«Каналы»' })).toHaveAttribute(
      'href',
      '/channels',
    );
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('список каналов — чекбокс отмечен для выбранных', () => {
    renderField(
      [
        makeChannel({ id: 'ch1', title: 'ВК школы' }),
        makeChannel({ id: 'ch2', title: 'Facebook', type: 'manual' }),
      ],
      ['ch1'],
    );

    expect(screen.getByLabelText('ВК · ВК школы')).toBeChecked();
    expect(screen.getByLabelText('Вручную · Facebook')).not.toBeChecked();
  });

  it('отметка канала добавляет его id в выбранные', async () => {
    const user = userEvent.setup();
    const { onChange } = renderField([makeChannel({ id: 'ch1' })], []);

    await user.click(screen.getByLabelText('ВК · ВК школы'));

    expect(onChange).toHaveBeenCalledWith(['ch1']);
  });

  it('снятие отметки убирает id из выбранных', async () => {
    const user = userEvent.setup();
    const { onChange } = renderField([makeChannel({ id: 'ch1' })], ['ch1']);

    await user.click(screen.getByLabelText('ВК · ВК школы'));

    expect(onChange).toHaveBeenCalledWith([]);
  });
});
