// Карточка слота в сетке расписания — одна механика на все дни недели
// (CLAUDE.md «Одна механика — один компонент»). <button>, не <div onClick>:
// доступна с клавиатуры без лишних атрибутов (CLAUDE.md «Доступность»).
import type { CSSProperties } from 'react';
import { CLASS_FORMAT_LABELS_RU } from './classFormatLabels';
import type { ScheduleSlot } from './scheduleGrid';
import { tzBadge } from './timezoneLabel';

const cardStyle: CSSProperties = {
  display: 'block',
  width: '100%',
  textAlign: 'left',
  padding: '10px 12px',
  borderRadius: 12,
  border: '1px solid var(--border)',
  background: '#fff',
  font: 'inherit',
  cursor: 'pointer',
  minHeight: 44,
};

const titleStyle: CSSProperties = { fontWeight: 600, fontSize: 14 };
const metaStyle: CSSProperties = { fontSize: 13, color: 'var(--ink-soft)', marginTop: 2 };

interface SlotCardProps {
  slot: ScheduleSlot;
  onSelect: () => void;
}

export function SlotCard({ slot, onSelect }: SlotCardProps) {
  const badge = tzBadge(slot.tz);
  return (
    <button type="button" style={cardStyle} onClick={onSelect}>
      <div style={titleStyle}>
        {slot.timeLabel} · {slot.title}
        {!slot.active && ' · выключено'}
      </div>
      <div style={metaStyle}>
        {slot.groupLabel ? `${slot.groupLabel} · ` : ''}
        {CLASS_FORMAT_LABELS_RU[slot.format]}
        {badge && ` · ${badge}`}
      </div>
    </button>
  );
}
