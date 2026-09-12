// Карточка одного ближайшего занятия на экране ученика (ТЗ
// student-screen.md, п.2). Не кнопка — карточка ничего не открывает (у
// ученика пока нет листа занятия), стиль общий с остальными списками
// (components/listCardStyles.ts), приём — как readOnlyStyle в
// channels/ChannelCard.tsx. Отменённое занятие не показывает, как на него
// попасть — притворяться обычным занятием нечестно (ТЗ, п.2: «отменённое
// видно как отменённое»).
import type { CSSProperties } from 'react';
import type { MyLessonDto } from '@xuanxue/shared';
import {
  listCardMetaStyle,
  listCardStyle,
  listCardTitleStyle,
} from '../components/listCardStyles';
import { formatDateTime } from '../lib/formatDate';
import { StudentLessonMeeting } from './StudentLessonMeeting';

const readOnlyCardStyle: CSSProperties = { ...listCardStyle, cursor: 'default' };
const cancelledBadgeStyle: CSSProperties = {
  margin: '8px 0 0',
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--danger)',
};

interface StudentLessonCardProps {
  lesson: MyLessonDto;
  /** Пояс для форматирования времени — только тестам нужен фиксированный
   * (CI гоняет vitest ещё и под TZ=Australia/Sydney), экрану — браузерный по
   * умолчанию (lib/formatDate.ts). */
  timeZone?: string;
}

export function StudentLessonCard({ lesson, timeZone }: StudentLessonCardProps) {
  const cancelled = lesson.status === 'cancelled';

  return (
    <li>
      <div style={readOnlyCardStyle}>
        <div style={listCardTitleStyle}>
          {formatDateTime(lesson.startsAt, timeZone)} · {lesson.classTitle}
        </div>
        <div style={listCardMetaStyle}>
          {lesson.groupLabel}
          {lesson.topic && ` · ${lesson.topic}`}
        </div>
        {cancelled ? (
          <p style={cancelledBadgeStyle}>Занятие отменено</p>
        ) : (
          <StudentLessonMeeting
            format={lesson.format}
            location={lesson.location}
            zoomLink={lesson.zoomLink}
            zoomPassword={lesson.zoomPassword}
          />
        )}
      </div>
    </li>
  );
}
