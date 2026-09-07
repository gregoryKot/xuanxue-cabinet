// Недельная сетка Вс…Сб (CLAUDE.md «Мобильный экран первым»): дни — колонки в
// горизонтальном скролле, читаемо уже на 360px без переноса карточек.
import type { CSSProperties } from 'react';
import { WEEKDAYS } from '@xuanxue/shared';
import { DaySlots } from './DaySlots';
import type { ScheduleGrid } from './scheduleGrid';

const scrollStyle: CSSProperties = {
  display: 'flex',
  gap: 12,
  overflowX: 'auto',
  paddingBottom: 8,
};
const columnStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  minWidth: 148,
  flexShrink: 0,
};

interface ScheduleGridViewProps {
  grid: ScheduleGrid;
  onSelectSlot: (classId: string) => void;
}

export function ScheduleGridView({ grid, onSelectSlot }: ScheduleGridViewProps) {
  return (
    <div style={scrollStyle}>
      {WEEKDAYS.map((day) => (
        <DaySlots
          key={day}
          day={day}
          slots={grid[day]}
          onSelectSlot={onSelectSlot}
          containerStyle={columnStyle}
        />
      ))}
    </div>
  );
}
