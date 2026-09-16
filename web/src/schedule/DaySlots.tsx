// Общий блок «подпись дня + слоты» — переиспользуется мобильным списком
// (ScheduleDayList) и недельной сеткой (ScheduleGridView), которые
// отличаются только внешним контейнером (вертикальная группа vs колонка).
// Раньше блок дублировался в обоих файлах (jscpd-храповик, CLAUDE.md «Дубли»).
//
// Подпись дня — растяжка-заглавные `.xuanxue-eyebrow` (макет Schedule.dc.html):
// день недели служебная метка над столбцом, а не заголовок наравне с
// названием занятия. Числа месяца рядом с ней, как на макете, здесь нет:
// сетка показывает правила расписания («каждый вторник»), а не конкретную
// неделю с датами.
import type { CSSProperties } from 'react';
import { WEEKDAY_LABELS_RU, type Weekday } from '@xuanxue/shared';
import { SlotCard } from './SlotCard';
import type { ScheduleSlot } from './scheduleGrid';

// День без занятий в недельной сетке: пустой столбец читается как «данные не
// загрузились» (макет Schedule.dc.html подписывает такой день словами).
// Мобильный список пустые дни не показывает вовсе и сюда не приходит.
const NO_SLOTS_TEXT = 'Занятий нет';

const emptyStyle: CSSProperties = { fontSize: 13, color: 'var(--ink-soft)' };

interface DaySlotsProps {
  day: Weekday;
  slots: ScheduleSlot[];
  onSelectSlot: (classId: string) => void;
  containerStyle: CSSProperties;
}

export function DaySlots({ day, slots, onSelectSlot, containerStyle }: DaySlotsProps) {
  return (
    <div style={containerStyle}>
      <span className="xuanxue-eyebrow">{WEEKDAY_LABELS_RU[day]}</span>
      {slots.length === 0 && <span style={emptyStyle}>{NO_SLOTS_TEXT}</span>}
      {slots.map((slot) => (
        <SlotCard
          key={slot.ruleId}
          slot={slot}
          onSelect={() => onSelectSlot(slot.classId)}
        />
      ))}
    </div>
  );
}
