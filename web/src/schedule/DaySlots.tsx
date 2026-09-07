// Общий блок «подпись дня + карточки занятий» — переиспользуется мобильным
// списком (ScheduleDayList) и десктопной сеткой (ScheduleGridView), которые
// отличаются только внешним контейнером (вертикальная группа vs колонка).
// Раньше блок дублировался в обоих файлах (jscpd-храповик, CLAUDE.md «Дубли»).
import type { CSSProperties } from 'react';
import { WEEKDAY_LABELS_RU, type Weekday } from '@xuanxue/shared';
import { SlotCard } from './SlotCard';
import type { ScheduleSlot } from './scheduleGrid';

const dayLabelStyle: CSSProperties = {
  fontWeight: 600,
  fontSize: 13,
  color: 'var(--ink-soft)',
};

interface DaySlotsProps {
  day: Weekday;
  slots: ScheduleSlot[];
  onSelectSlot: (classId: string) => void;
  containerStyle: CSSProperties;
}

export function DaySlots({ day, slots, onSelectSlot, containerStyle }: DaySlotsProps) {
  return (
    <div style={containerStyle}>
      <span style={dayLabelStyle}>{WEEKDAY_LABELS_RU[day]}</span>
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
