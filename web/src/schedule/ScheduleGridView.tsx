// Недельная сетка Вс…Сб (CLAUDE.md «Мобильный экран первым»): дни — семь
// равных колонок `minmax(0, 1fr)` вместо фиксированной ширины: на мониторе
// неделя видна целиком, а не три с половиной дня с обрезанным четвёртым
// (отзыв владельца 2026-09-09). Пол по ширине колонки не нужен: сетку
// показывает только широкий экран, на телефоне ScheduleScreen рисует список.
//
// Облик — макет Schedule.dc.html: столбцы разделены волосяной линией и
// стоят вплотную, без зазора и без рамок вокруг каждого дня. Линия сверху
// закрывает сетку от заголовка экрана, линия слева отделяет столбец от
// соседа — поэтому у первого дня её нет.
import type { CSSProperties } from 'react';
import { WEEKDAYS } from '@xuanxue/shared';
import { DaySlots } from './DaySlots';
import type { ScheduleGrid } from './scheduleGrid';

const gridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
  borderTop: '1px solid var(--line)',
  overflowX: 'auto',
};
const columnStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
  minWidth: 0,
  padding: '18px 16px 24px',
  borderLeft: '1px solid var(--line)',
};
const firstColumnStyle: CSSProperties = {
  ...columnStyle,
  padding: '18px 16px 24px 0',
  borderLeft: 'none',
};

interface ScheduleGridViewProps {
  grid: ScheduleGrid;
  onSelectSlot: (classId: string) => void;
}

export function ScheduleGridView({ grid, onSelectSlot }: ScheduleGridViewProps) {
  return (
    <div style={gridStyle}>
      {WEEKDAYS.map((day, index) => (
        <DaySlots
          key={day}
          day={day}
          slots={grid[day]}
          onSelectSlot={onSelectSlot}
          containerStyle={index === 0 ? firstColumnStyle : columnStyle}
        />
      ))}
    </div>
  );
}
