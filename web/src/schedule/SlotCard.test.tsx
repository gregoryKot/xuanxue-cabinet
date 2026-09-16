// Строка слота: время, название и служебная строка — каждое своим
// элементом (макет Schedule.dc.html), поэтому проверки точечные, а не по
// одной склеенной строке.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SlotCard } from './SlotCard';
import type { ScheduleSlot } from './scheduleGrid';

function makeSlot(overrides: Partial<ScheduleSlot> = {}): ScheduleSlot {
  return {
    classId: 'c1',
    ruleId: 'r1',
    title: 'Тайцзицюань',
    groupLabel: 'средняя группа',
    format: 'online',
    timeLabel: '19:00–20:00',
    startMinutes: 19 * 60,
    active: true,
    linkMissing: false,
    channelCount: 0,
    ...overrides,
  };
}

describe('SlotCard', () => {
  it('активный слот с подписью группы — без пометки «выключено»', () => {
    render(<SlotCard slot={makeSlot()} onSelect={vi.fn()} />);

    expect(screen.getByText('19:00–20:00')).toBeInTheDocument();
    expect(screen.getByText('Тайцзицюань')).toBeInTheDocument();
    expect(screen.getByText(/средняя группа · Онлайн/)).toBeInTheDocument();
    expect(screen.queryByText(/выключено/)).not.toBeInTheDocument();
  });

  it('выключенный слот без подписи группы — пометка «выключено», формат без разделителя', () => {
    render(
      <SlotCard slot={makeSlot({ active: false, groupLabel: '' })} onSelect={vi.fn()} />,
    );

    expect(screen.getByText(/выключено/)).toBeInTheDocument();
    expect(screen.getByText(/^Онлайн · без каналов$/)).toBeInTheDocument();
  });

  it('без каналов — серым «без каналов» на карточке (ревью п.1)', () => {
    render(<SlotCard slot={makeSlot({ channelCount: 0 })} onSelect={vi.fn()} />);

    expect(screen.getByText(/без каналов/)).toBeInTheDocument();
  });

  it('с каналами — число со склонением на карточке (ревью п.1)', () => {
    render(<SlotCard slot={makeSlot({ channelCount: 2 })} onSelect={vi.fn()} />);

    expect(screen.getByText(/2 канала/)).toBeInTheDocument();
  });

  it('клик вызывает onSelect', async () => {
    const onSelect = vi.fn();
    render(<SlotCard slot={makeSlot()} onSelect={onSelect} />);

    await userEvent.click(screen.getByRole('button'));

    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('онлайн без ссылки Zoom — «без ссылки» прямо в сетке', () => {
    render(<SlotCard slot={makeSlot({ linkMissing: true })} onSelect={vi.fn()} />);

    expect(screen.getByText('без ссылки')).toBeInTheDocument();
  });

  it('ссылка есть — пометки нет', () => {
    render(<SlotCard slot={makeSlot()} onSelect={vi.fn()} />);

    expect(screen.queryByText('без ссылки')).not.toBeInTheDocument();
  });
});
