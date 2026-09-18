// Строка занятия в списке «дальше» на экране ученика (ТЗ student-screen.md,
// п.2; макет 1c-planning.html, docs/adr/0043). Список теперь одна карточка
// (обёртка — StudentLessonsScreen.tsx, `oneCardListStyle`), поэтому строка не
// несёт свой фон и тень — только паддинг и волосяная линия снизу (проп
// `isLast`), тот же приём, что у planning/LessonCard.tsx. Ближайшее занятие
// рисуется крупно и отдельно (StudentNextLesson.tsx), сюда попадают только
// следующие за ним.
//
// Макет рисует эту строку короче (только дата и название) — здесь она
// сохраняет группу/тему и способ подключиться: это существующая, покрытая
// тестами информация, отказ от неё не входит в задачу вёрстки (см. отчёт PR).
// Отменённое занятие не показывает, как на него попасть — притворяться
// обычным занятием нечестно (ТЗ, п.2: «отменённое видно как отменённое»).
import type { CSSProperties } from 'react';
import type { MyLessonDto } from '@xuanxue/shared';
import { formatDateTime } from '../lib/formatDate';
import { StudentLessonMeeting } from './StudentLessonMeeting';

const rowStyle: CSSProperties = {
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
// Информационный текст — --ink-soft, не --ink-faint (CLAUDE.md
// «Доступность»); отмена красится --danger: её нельзя пропустить.
const cancelledBadgeStyle: CSSProperties = {
  margin: '4px 0 0',
  color: 'var(--danger)',
};

interface StudentLessonCardProps {
  lesson: MyLessonDto;
  /** Пояс для форматирования времени — только тестам нужен фиксированный
   * (CI гоняет vitest ещё и под TZ=Australia/Sydney), экрану — браузерный по
   * умолчанию (lib/formatDate.ts). */
  timeZone?: string;
  /** Последняя строка общей карточки списка — без нижней волосяной линии
   * (StudentLessonsScreen.tsx, docs/adr/0043), тот же приём, что у
   * planning/LessonCard.tsx. */
  isLast?: boolean;
}

export function StudentLessonCard({
  lesson,
  timeZone,
  isLast = false,
}: StudentLessonCardProps) {
  const cancelled = lesson.status === 'cancelled';

  return (
    <li style={{ ...rowStyle, borderBottom: isLast ? 'none' : '1px solid var(--panel)' }}>
      <span style={dateTimeStyle}>{formatDateTime(lesson.startsAt, timeZone)}</span>
      <span style={titleStyle}>{lesson.classTitle}</span>
      {(lesson.groupLabel || lesson.topic) && (
        <span style={metaStyle}>
          {[lesson.groupLabel, lesson.topic].filter(Boolean).join(' · ')}
        </span>
      )}
      {cancelled ? (
        <p className="xuanxue-status-label" style={cancelledBadgeStyle}>
          Занятие отменено
        </p>
      ) : (
        <StudentLessonMeeting
          format={lesson.format}
          location={lesson.location}
          zoomLink={lesson.zoomLink}
          zoomPassword={lesson.zoomPassword}
        />
      )}
    </li>
  );
}
