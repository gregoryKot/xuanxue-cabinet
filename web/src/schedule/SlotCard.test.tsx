import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SlotCard } from './SlotCard';
import type { ScheduleSlot } from './scheduleGrid';

const BROWSER_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;

function makeSlot(overrides: Partial<ScheduleSlot> = {}): ScheduleSlot {
  return {
    classId: 'c1',
    ruleId: 'r1',
    title: 'Тайцзицюань',
    groupLabel: 'средняя группа',
    format: 'online',
    timeLabel: '19:00–20:00',
    startMinutes: 19 * 60,
    tz: BROWSER_TZ,
    active: true,
    ...overrides,
  };
}

describe('SlotCard', () => {
  it('активный слот с подписью группы — без пометки «выключено»', () => {
    render(<SlotCard slot={makeSlot()} onSelect={vi.fn()} />);

    expect(screen.getByText(/19:00–20:00 · Тайцзицюань/)).toBeInTheDocument();
    expect(screen.getByText(/средняя группа · Онлайн/)).toBeInTheDocument();
    expect(screen.queryByText(/выключено/)).not.toBeInTheDocument();
  });

  it('выключенный слот без подписи группы — пометка «выключено», формат без разделителя', () => {
    render(
      <SlotCard slot={makeSlot({ active: false, groupLabel: '' })} onSelect={vi.fn()} />,
    );

    expect(screen.getByText(/выключено/)).toBeInTheDocument();
    expect(screen.getByText('Онлайн')).toBeInTheDocument();
  });

  it('клик вызывает onSelect', async () => {
    const onSelect = vi.fn();
    render(<SlotCard slot={makeSlot()} onSelect={onSelect} />);

    await userEvent.click(screen.getByRole('button'));

    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('пояс занятия отличается от браузерного — приписка в конце строки', () => {
    render(<SlotCard slot={makeSlot({ tz: 'Pacific/Auckland' })} onSelect={vi.fn()} />);

    expect(screen.getByText(/Онлайн · Pacific\/Auckland/)).toBeInTheDocument();
  });

  it('пояс занятия совпадает с браузерным — приписки нет', () => {
    render(<SlotCard slot={makeSlot({ tz: BROWSER_TZ })} onSelect={vi.fn()} />);

    expect(screen.queryByText(BROWSER_TZ, { exact: false })).not.toBeInTheDocument();
  });
});
