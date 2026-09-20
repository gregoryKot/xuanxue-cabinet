// Строка занятия внутри общей карточки дня (LessonDayGroup.tsx, макет
// 1c-planning.html, docs/adr/0043) — колонка времени, название антиквой и
// тема под ним, статус рассылки справа. Список дня теперь одна карточка
// (обёртка — LessonDayGroup.tsx, `--radius-block`, `overflow: hidden`),
// поэтому строка не несёт свой фон и тень — только паддинг и волосяная линия
// снизу (проп `isLast`), тот же приём, что у ExamCard.tsx/BroadcastCard.tsx.
//
// `id="lesson-{id}"` на `<li>` — якорь для внешней ссылки на конкретное
// занятие (бот, уведомление, useScrollToHash.ts). Карточки «Сегодня»
// (TodayLessonCard.tsx) показывают часть этих же занятий ещё раз без якоря —
// два элемента с одним `id` в HTML невалидны, поэтому там его нет вовсе.
//
// Теги даты (ADR-0075) — строкой пилюль под кнопкой, не внутри неё: каждая
// ведёт на экран тега (TagPillLinks.tsx), а <a> внутри <button> невалиден и
// недоступен (CLAUDE.md «Доступность»).
import type { CSSProperties } from 'react';
import type { LessonDto } from '@xuanxue/shared';
import { TagPillLinks } from '../components/TagPillLinks';
import { formatTime } from '../lib/formatDate';
import { CancelledBroadcastLink, LessonBroadcastBadge } from './LessonBroadcastBadge';

const TAGS_GROUP_LABEL = 'Теги занятия';
const TIME_COLUMN_WIDTH_PX = 56;

const rowButtonStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 18,
  width: '100%',
  minHeight: 44,
  padding: '16px 20px',
  border: 'none',
  background: 'transparent',
  font: 'inherit',
  textAlign: 'left',
  cursor: 'pointer',
};
const timeStyle: CSSProperties = {
  flexShrink: 0,
  width: TIME_COLUMN_WIDTH_PX,
  fontSize: 16,
  fontWeight: 500,
  fontVariantNumeric: 'tabular-nums',
};
const contentStyle: CSSProperties = { minWidth: 0, flex: 1 };
const titleStyle: CSSProperties = { fontFamily: 'var(--font-display)', fontSize: 22 };
// 6, а не 2: под названием антиквой кеглем 22 два пикселя читаются как ноль —
// строка темы («Тема не задана») липла к заголовку (отзыв владельца
// 2026-09-19). Тот же зазор, что у карточки «Сегодня» (TodayLessonCard.tsx).
const metaStyle: CSSProperties = { marginTop: 6, fontSize: 14, color: 'var(--ink-soft)' };
const statusStyle: CSSProperties = { flexShrink: 0, fontSize: 13 };

interface LessonCardProps {
  lesson: LessonDto;
  className: string;
  onSelect: () => void;
  /** Последняя строка карточки дня — без нижней волосяной линии
   * (LessonDayGroup.tsx, docs/adr/0043). */
  isLast?: boolean;
}

export function LessonCard({
  lesson,
  className,
  onSelect,
  isLast = false,
}: LessonCardProps) {
  const cancelled = lesson.status === 'cancelled';
  const broadcast = lesson.broadcast;

  return (
    <li
      id={`lesson-${lesson.id}`}
      style={{ borderBottom: isLast ? 'none' : '1px solid var(--panel)' }}
    >
      <button
        type="button"
        style={{ ...rowButtonStyle, color: cancelled ? 'var(--ink-soft)' : 'inherit' }}
        onClick={onSelect}
      >
        <span style={timeStyle}>{formatTime(lesson.startsAt)}</span>
        <span style={contentStyle}>
          <span style={titleStyle}>{className}</span>
          <span style={metaStyle}>
            {lesson.topic || 'Тема не задана'}
            {cancelled && ' · Отменено'}
            {lesson.recordings.length > 0 && ' · запись есть'}
          </span>
        </span>
        <LessonBroadcastBadge broadcast={broadcast} style={statusStyle} />
      </button>
      <TagPillLinks tags={lesson.tags} groupLabel={TAGS_GROUP_LABEL} />
      {broadcast?.status === 'cancelled' && <CancelledBroadcastLink />}
    </li>
  );
}
