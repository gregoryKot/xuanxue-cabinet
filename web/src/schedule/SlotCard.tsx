// Строка слота расписания — одна механика на все дни недели (CLAUDE.md
// «Одна механика — один компонент»). <button>, не <div onClick>: доступна с
// клавиатуры без лишних атрибутов (CLAUDE.md «Доступность»).
//
// Облик — макет Schedule.dc.html: время антиквой отдельной строкой сверху,
// под ним название занятия, ещё ниже служебная строка (формат, каналы).
// Раньше время и название стояли в одну строку через «·» — в колонке дня
// шириной 160px такая строка ломалась пополам в произвольном месте.
// Каркас строки общий с planning/LessonCard.tsx (components/listCardStyles.ts).
import type { CSSProperties } from 'react';
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
const DISABLED_TEXT = 'выключено';

const slotStyle: CSSProperties = { ...listCardStyle, padding: '14px 4px' };
const timeStyle: CSSProperties = { ...listCardTitleStyle, lineHeight: 1.1 };
const titleStyle: CSSProperties = { marginTop: 4, lineHeight: 1.35 };
const statusRowStyle: CSSProperties = {
  ...listCardMetaStyle,
  display: 'flex',
  flexWrap: 'wrap',
  gap: 10,
  marginTop: 8,
};
// Информационный текст — --ink-soft, не --ink-faint (CLAUDE.md
// «Доступность»: у --ink-faint контраст с бумагой ниже AA).
const dangerStatusStyle: CSSProperties = { color: 'var(--danger)' };

interface SlotCardProps {
  slot: ScheduleSlot;
  onSelect: () => void;
}

export function SlotCard({ slot, onSelect }: SlotCardProps) {
  return (
    <button type="button" style={slotStyle} onClick={onSelect}>
      <div style={timeStyle}>{slot.timeLabel}</div>
      <div style={titleStyle}>{slot.title}</div>
      <div style={listCardMetaStyle}>
        {slot.groupLabel ? `${slot.groupLabel} · ` : ''}
        {CLASS_FORMAT_LABELS_RU[slot.format]}
        {' · '}
        {formatChannelCount(slot.channelCount)}
      </div>
      {(!slot.active || slot.linkMissing) && (
        <div style={statusRowStyle}>
          {!slot.active && <span className="xuanxue-status-label">{DISABLED_TEXT}</span>}
          {slot.linkMissing && (
            <span className="xuanxue-status-label" style={dangerStatusStyle}>
              {NO_LINK_TEXT}
            </span>
          )}
        </div>
      )}
    </button>
  );
}
