// Недельная сетка Вс…Сб (CLAUDE.md «Мобильный экран первым»): дни — семь
// равных колонок `minmax(0, 1fr)` вместо фиксированной ширины: на мониторе
// неделя видна целиком, а не три с половиной дня с обрезанным четвёртым
// (отзыв владельца 2026-09-09). Пол по ширине колонки не нужен: сетку
// показывает только широкий экран, на телефоне ScheduleScreen рисует список.
import type { CSSProperties } from 'react';
import { WEEKDAYS } from '@xuanxue/shared';
import { DaySlots } from './DaySlots';
import type { ScheduleGrid } from './scheduleGrid';

const scrollStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
  gap: 12,
  overflowX: 'auto',
  paddingBottom: 8,
};
const columnStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  minWidth: 0,
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
