// Неделя расписания — дни карточками, одна раскладка на все ширины (CLAUDE.md
// «Мобильный экран первым»): на телефоне один столбец, на мониторе столько,
// сколько помещается по ширине, а дни перетекают сверху вниз, как в
// газетной вёрстке — «Вс, Пн | Вт, Ср | Чт, Пт, Сб».
//
// Раньше на мониторе была сетка семи колонок. Колонке содержимого кабинета
// достаётся не больше ~850px (лист 1120px минус боковое меню 236px,
// appShellStyles.ts), и в семи колонках по ~110px «Тайцзицюань» рвалось на
// «Тайцзицюан|ь», время — на тире, адрес — в три строки (отзыв владельца
// 2026-10-02: «не красивое»). Колонка дня шириной от 260px держит строку
// занятия целиком: время слева, название с группой и место справа.
//
// Пустые дни не показываются: «Занятий нет» семь раз подряд ничего не
// сообщает, а пропуск дня в неделе виден и так.
import type { CSSProperties } from 'react';
import { WEEKDAYS } from '@xuanxue/shared';
import { DaySlots } from './DaySlots';
import type { ScheduleGrid } from './scheduleGrid';

const DAY_COLUMN_MIN_WIDTH_PX = 260;

const columnsStyle: CSSProperties = {
  columnWidth: DAY_COLUMN_MIN_WIDTH_PX,
  columnGap: 16,
};
// Многоколоночная вёрстка не знает `gap` между блоками — промежуток между
// днями несёт отступ снизу; `break-inside: avoid` не даёт карточке дня
// разломиться между колонками.
const dayGroupStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  breakInside: 'avoid',
  marginBottom: 24,
};

interface ScheduleDayListProps {
  grid: ScheduleGrid;
  onSelectSlot: (classId: string) => void;
}

export function ScheduleDayList({ grid, onSelectSlot }: ScheduleDayListProps) {
  const days = WEEKDAYS.filter((day) => grid[day].length > 0);

  return (
    <div style={columnsStyle}>
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
