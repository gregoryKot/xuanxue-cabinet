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

// Занятие, которое некуда открыть: онлайн без ссылки Zoom — рассылка уйдёт
// без ссылки, и ученик останется за дверью. Видно прямо в сетке, чтобы не
// открывать каждое занятие по очереди (отзыв владельца 2026-09-12).
const NO_LINK_TEXT = 'без ссылки';

interface SlotCardProps {
  slot: ScheduleSlot;
  onSelect: () => void;
}

export function SlotCard({ slot, onSelect }: SlotCardProps) {
  return (
    <button type="button" style={listCardStyle} onClick={onSelect}>
      <div style={listCardTitleStyle}>
        {slot.timeLabel} · {slot.title}
        {!slot.active && ' · выключено'}
      </div>
      <div style={listCardMetaStyle}>
        {slot.groupLabel ? `${slot.groupLabel} · ` : ''}
        {CLASS_FORMAT_LABELS_RU[slot.format]}
        {' · '}
        {formatChannelCount(slot.channelCount)}
        {slot.linkMissing && (
          <>
            {' · '}
            <span style={{ color: 'var(--danger)' }}>{NO_LINK_TEXT}</span>
          </>
        )}
      </div>
    </button>
  );
}
