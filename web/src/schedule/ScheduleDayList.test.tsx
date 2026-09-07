import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { WEEKDAYS, type Weekday } from '@xuanxue/shared';
import { ScheduleDayList } from './ScheduleDayList';
import type { ScheduleGrid, ScheduleSlot } from './scheduleGrid';

function emptyGrid(): ScheduleGrid {
  const grid = {} as ScheduleGrid;
  for (const day of WEEKDAYS) grid[day] = [];
  return grid;
}

function makeSlot(overrides: Partial<ScheduleSlot> = {}): ScheduleSlot {
  return {
    classId: 'c1',
    ruleId: 'r1',
    title: 'Тайцзицюань',
    groupLabel: '',
    format: 'online',
    timeLabel: '19:00–20:00',
    startMinutes: 1140,
    tz: 'Asia/Jerusalem',
    active: true,
    channelCount: 0,
    ...overrides,
  };
}

describe('ScheduleDayList', () => {
  it('пустые дни не рендерятся вовсе', () => {
    const grid = emptyGrid();
    grid[2 as Weekday] = [makeSlot()];

    render(<ScheduleDayList grid={grid} onSelectSlot={vi.fn()} />);

    expect(screen.getByText('Тайцзицюань', { exact: false })).toBeInTheDocument();
    // Один день с занятием — одна подпись дня недели на экране.
    expect(screen.getAllByText(/^(Вс|Пн|Вт|Ср|Чт|Пт|Сб)$/)).toHaveLength(1);
  });

  it('полностью пустая сетка — список пуст', () => {
    const { container } = render(
      <ScheduleDayList grid={emptyGrid()} onSelectSlot={vi.fn()} />,
    );

    expect(container.querySelectorAll('button')).toHaveLength(0);
  });

  it('клик по карточке вызывает onSelectSlot с classId', async () => {
    const user = userEvent.setup();
    const grid = emptyGrid();
    grid[2 as Weekday] = [makeSlot({ classId: 'c42' })];
    const onSelectSlot = vi.fn();

    render(<ScheduleDayList grid={grid} onSelectSlot={onSelectSlot} />);
    await user.click(screen.getByRole('button'));

    expect(onSelectSlot).toHaveBeenCalledWith('c42');
  });
});
