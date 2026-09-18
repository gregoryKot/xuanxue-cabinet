// Общая шапка строки занятия — дата/время, название, тема/группа и пометка
// «Занятие отменено» (CLAUDE.md «Одна механика — один компонент»): нужна и
// строке ближайших занятий (StudentLessonCard.tsx), и строке архива
// (ArchivedLessonCard.tsx, docs/PLAN.md §14 слой 3.3) — раньше была
// скопирована во втором файле, jscpd поймал дубль.
import type { CSSProperties } from 'react';
import { formatDateTime } from '../lib/formatDate';

const CANCELLED_TEXT = 'Занятие отменено';

/** Общий каркас строки списка — паддинг и колонка (StudentLessonsScreen.tsx,
 * ArchiveScreen.tsx): волосяную линию снизу красит сама строка через проп
 * `isLast`, здесь её нет. */
export const lessonRowStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  padding: '14px 16px',
};
const dateTimeStyle: CSSProperties = {
  fontSize: 13,
  fontVariantNumeric: 'tabular-nums',
  color: 'var(--ink-soft)',
};
const titleStyle: CSSProperties = { fontFamily: 'var(--font-display)', fontSize: 20 };
const metaStyle: CSSProperties = { fontSize: 13, color: 'var(--ink-soft)' };
// Информационный текст — --ink-soft, не --ink-faint (CLAUDE.md «Доступность»);
// отмена красится --danger: её нельзя пропустить.
const cancelledBadgeStyle: CSSProperties = {
  margin: '4px 0 0',
  color: 'var(--danger)',
};

interface LessonSummaryHeaderProps {
  startsAt: string;
  classTitle: string;
  groupLabel: string;
  topic: string;
  cancelled: boolean;
  /** Пояс форматирования — только тестам нужен фиксированный (CI гоняет
   * vitest ещё и под TZ=Australia/Sydney), экрану — браузерный по умолчанию
   * (lib/formatDate.ts). */
  timeZone?: string;
}

export function LessonSummaryHeader({
  startsAt,
  classTitle,
  groupLabel,
  topic,
  cancelled,
  timeZone,
}: LessonSummaryHeaderProps) {
  return (
    <>
      <span style={dateTimeStyle}>{formatDateTime(startsAt, timeZone)}</span>
      <span style={titleStyle}>{classTitle}</span>
      {(groupLabel || topic) && (
        <span style={metaStyle}>{[groupLabel, topic].filter(Boolean).join(' · ')}</span>
      )}
      {cancelled && (
        <p className="xuanxue-status-label" style={cancelledBadgeStyle}>
          {CANCELLED_TEXT}
        </p>
      )}
    </>
  );
}
