// Карточка слота в сетке расписания — одна механика на все дни недели
// (CLAUDE.md «Одна механика — один компонент»). <button>, не <div onClick>:
// доступна с клавиатуры без лишних атрибутов (CLAUDE.md «Доступность»).
// Стиль карточки — общий с planning/LessonCard.tsx (components/listCardStyles.ts).
import {
  listCardMetaStyle,
  listCardStyle,
  listCardTitleStyle,
} from '../components/listCardStyles';
import { formatChannelCount } from './channelCountLabel';
import { CLASS_FORMAT_LABELS_RU } from './classFormatLabels';
import type { ScheduleSlot } from './scheduleGrid';
import { tzBadge } from './timezoneLabel';

interface SlotCardProps {
  slot: ScheduleSlot;
  onSelect: () => void;
}

export function SlotCard({ slot, onSelect }: SlotCardProps) {
  const badge = tzBadge(slot.tz);
  return (
    <button type="button" style={listCardStyle} onClick={onSelect}>
      <div style={listCardTitleStyle}>
        {slot.timeLabel} · {slot.title}
        {!slot.active && ' · выключено'}
      </div>
      <div style={listCardMetaStyle}>
        {slot.groupLabel ? `${slot.groupLabel} · ` : ''}
        {CLASS_FORMAT_LABELS_RU[slot.format]}
        {badge && ` · ${badge}`}
        {' · '}
        {formatChannelCount(slot.channelCount)}
      </div>
    </button>
  );
}
