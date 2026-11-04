// Строка занятия в «Расписании» (CLAUDE.md «Одна механика — один
// компонент»). <button>, не <div onClick>: доступна с клавиатуры без лишних
// атрибутов (CLAUDE.md «Доступность»).
//
// Раньше каждое занятие было отдельной карточкой: время «08:00–09:00» крупным
// кеглем ломалось на тире в колонке дня, места не было вовсе, подпись группы
// тонула в серой строке «средняя группа · Онлайн · 1 канал», а на телефоне
// тридцать карточек шли лентой в четыре экрана (отзыв владельца
// 2026-10-02). Теперь день — одна карточка (DaySlots.tsx), занятие — строка в
// ней: начало крупно, конец тише, название с группой, место со значком.
import { EVERY_TWO_WEEKS_NOTE_RU } from '@xuanxue/shared';
import { ClassPlace } from './ClassPlace';
import {
  bodyStyle,
  dangerStatusStyle,
  destinationWarningStyle,
  endStyle,
  groupStyle,
  rowStyle,
  startStyle,
  statusRowStyle,
  tagsStyle,
  timeStyle,
  titleStyle,
} from './slotRowStyles';
import type { ScheduleSlot } from './scheduleGrid';

// Онлайн без ссылки Zoom — рассылка уйдёт без ссылки, ученик останется за
// дверью. Это видно прямо в неделе, чтобы не открывать каждое занятие по
// очереди (отзыв владельца 2026-09-12, ревью п.1). Куда уходят ссылка и
// записи, пишет отдельная строка «→ каналы» (ADR-0191): онлайн без каналов
// там же предупреждение, второй пометки «без каналов» нет.
const NO_LINK_TEXT = 'без ссылки';
const DISABLED_TEXT = 'выключено';
const GROUP_SEPARATOR = ' · ';

interface SlotRowProps {
  slot: ScheduleSlot;
  onSelect: () => void;
}

export function SlotRow({ slot, onSelect }: SlotRowProps) {
  return (
    <button type="button" style={rowStyle} onClick={onSelect}>
      <span style={timeStyle}>
        <span style={startStyle}>{slot.startTime}</span>
        <span style={endStyle}>{slot.endTime}</span>
      </span>
      <span style={bodyStyle}>
        <span style={titleStyle}>
          {slot.title}
          {slot.groupLabel && (
            <span style={groupStyle}>
              {GROUP_SEPARATOR}
              {slot.groupLabel}
            </span>
          )}
        </span>
        <ClassPlace format={slot.format} location={slot.location} />
        {/* «Раз в 2 недели» (ADR-0168) — тихой строкой под местом: неделя
            показывает правила, и без неё слот читался бы как «каждую неделю». */}
        {slot.isBiweekly && <span style={tagsStyle}>{EVERY_TWO_WEEKS_NOTE_RU}</span>}
        {/* Постоянные теги курса — подписью, не пилюлями: в карточке дня
            они ничего не фильтруют (ADR-0072). */}
        {slot.tags.length > 0 && <span style={tagsStyle}>{slot.tags.join(', ')}</span>}
        {slot.destination && (
          <span style={slot.destination.isWarning ? destinationWarningStyle : tagsStyle}>
            {slot.destination.text}
          </span>
        )}
        {slot.destination?.warning && (
          <span style={destinationWarningStyle}>{slot.destination.warning}</span>
        )}
        {(!slot.active || slot.linkMissing) && (
          <span style={statusRowStyle}>
            {!slot.active && (
              <span className="xuanxue-status-label">{DISABLED_TEXT}</span>
            )}
            {slot.linkMissing && (
              <span className="xuanxue-status-label" style={dangerStatusStyle}>
                {NO_LINK_TEXT}
              </span>
            )}
          </span>
        )}
      </span>
    </button>
  );
}
