// Блок «название дня + занятия» недели расписания (ScheduleDayList.tsx).
//
// День — одна карточка, занятия в ней разделены волосяной линией
// (oneCardListStyle, ADR-0043): пять отдельных карточек подряд в каждом дне
// делали неделю из тридцати занятий лентой в четыре экрана телефона (отзыв
// владельца 2026-10-02). Название дня — растяжка-заглавные
// `.xuanxue-eyebrow`, служебная метка над карточкой, а не заголовок наравне с
// названием занятия; числа месяца нет — неделя показывает правила
// («каждый вторник»), а не конкретную неделю.
import type { CSSProperties } from 'react';
import type { Weekday } from '@xuanxue/shared';
import { oneCardListStyle } from '../components/listCardStyles';
import { SlotRow } from './SlotRow';
import type { ScheduleSlot } from './scheduleGrid';
import { WEEKDAY_NAMES_RU } from './weekdayNames';

const headingStyle: CSSProperties = { margin: 0, fontWeight: 400 };

function rowStyle(isLast: boolean): CSSProperties {
  return { borderBottom: isLast ? 'none' : '1px solid var(--line-soft)' };
}

interface DaySlotsProps {
  day: Weekday;
  slots: ScheduleSlot[];
  onSelectSlot: (classId: string) => void;
  containerStyle: CSSProperties;
}

export function DaySlots({ day, slots, onSelectSlot, containerStyle }: DaySlotsProps) {
  return (
    <section style={containerStyle} aria-label={WEEKDAY_NAMES_RU[day]}>
      <h2 className="xuanxue-eyebrow" style={headingStyle}>
        {WEEKDAY_NAMES_RU[day]}
      </h2>
      <ul style={oneCardListStyle}>
        {slots.map((slot, index) => (
          <li key={slot.ruleId} style={rowStyle(index === slots.length - 1)}>
            <SlotRow slot={slot} onSelect={() => onSelectSlot(slot.classId)} />
          </li>
        ))}
      </ul>
    </section>
  );
}
