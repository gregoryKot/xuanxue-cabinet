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
import { listCardMetaStyle, listCardStyle } from '../components/listCardStyles';
import { formatChannelCount } from './channelCountLabel';
import { CLASS_FORMAT_LABELS_RU } from './classFormatLabels';
import type { ScheduleSlot } from './scheduleGrid';

// Занятие, которое некуда открыть: онлайн без ссылки Zoom — рассылка уйдёт
// без ссылки, и ученик останется за дверью. Видно прямо в сетке, чтобы не
// открывать каждое занятие по очереди (отзыв владельца 2026-09-12).
const NO_LINK_TEXT = 'без ссылки';
const DISABLED_TEXT = 'выключено';

// 14px по вертикали — плотнее общей карточки: в колонке дня их до четырёх
// подряд. По горизонтали отступ общий (18px), а НЕ 4px, как было: четыре
// пикселя приклеивали название к краю, и в узкой колонке текст выглядел
// вылезающим за карточку (снимок владельца 2026-09-19).
const slotStyle: CSSProperties = { ...listCardStyle, padding: '14px 18px' };
// Время — Golos Text, не антиква: `listCardTitleStyle` набирает заголовок
// Cormorant, а у него старостильные цифры (нуль мельче остальных, девятка с
// выносом) — «08:00–09:00» в сетке читалось как случайный набор высот
// (ADR-0043: числа набираем текстовым шрифтом). Кегль и вес заголовка при
// этом сохраняем: время здесь — главное в карточке.
const timeStyle: CSSProperties = {
  fontSize: 23,
  fontWeight: 500,
  lineHeight: 1.1,
  fontVariantNumeric: 'tabular-nums',
};
// Название занятия — свободный текст до 120 знаков (CLASS_LIMITS.title), и
// одно длинное слово («Ицзиньцзин», «Тайцзицюань») шире колонки дня в 160px.
// `anywhere`, а не `break-word`: колонка сетки должна уметь сжаться ниже
// самого длинного слова, а на min-content влияет только `anywhere`.
const titleStyle: CSSProperties = {
  marginTop: 4,
  lineHeight: 1.35,
  overflowWrap: 'anywhere',
};
// Подпись группы — тоже свободное поле (до 60 знаков), рвём так же, как
// название выше.
const metaStyle: CSSProperties = { ...listCardMetaStyle, overflowWrap: 'anywhere' };
const statusRowStyle: CSSProperties = {
  ...metaStyle,
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
      <div style={metaStyle}>
        {slot.groupLabel ? `${slot.groupLabel} · ` : ''}
        {CLASS_FORMAT_LABELS_RU[slot.format]}
        {' · '}
        {formatChannelCount(slot.channelCount)}
        {/* Постоянные теги курса — подписью рядом с форматом и каналами, не
            пилюлями: в сетке дня они ничего не фильтруют (ADR-0072). Пустой
            список ничего не добавляет к строке. */}
        {slot.tags.length > 0 && ` · ${slot.tags.join(', ')}`}
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
