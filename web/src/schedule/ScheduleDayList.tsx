// Вертикальный список по дням для мобильного экрана (<768px, CLAUDE.md
// «Мобильный экран первым»): семь колонок сетки не помещаются на 360px без
// горизонтального скролла карточек — список читается сверху вниз, пустые
// дни скрыты (их показывать нечего, а не «Вт — пусто» семь раз подряд).
import type { CSSProperties } from 'react';
import { WEEKDAYS } from '@xuanxue/shared';
import { DaySlots } from './DaySlots';
import type { ScheduleGrid } from './scheduleGrid';

const listStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 16 };
const dayGroupStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 8 };

interface ScheduleDayListProps {
  grid: ScheduleGrid;
  onSelectSlot: (classId: string) => void;
}

export function ScheduleDayList({ grid, onSelectSlot }: ScheduleDayListProps) {
  const days = WEEKDAYS.filter((day) => grid[day].length > 0);

  return (
    <div style={listStyle}>
      {days.map((day) => (
        <DaySlots
          key={day}
          day={day}
          slots={grid[day]}
          onSelectSlot={onSelectSlot}
          containerStyle={dayGroupStyle}
        />
      ))}
    </div>
  );
}
