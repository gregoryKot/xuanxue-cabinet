// Строка занятия в списке «дальше» на экране ученика (ТЗ student-screen.md,
// п.2). Не кнопка — строка ничего не открывает (у ученика нет листа
// занятия), каркас общий с остальными списками кабинета
// (components/listCardStyles.ts). Ближайшее занятие рисуется крупно и
// отдельно (StudentNextLesson.tsx), сюда попадают только следующие за ним.
// Отменённое занятие не показывает, как на него попасть — притворяться
// обычным занятием нечестно (ТЗ, п.2: «отменённое видно как отменённое»).
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
// Информационный текст — --ink-soft, не --ink-faint (CLAUDE.md
// «Доступность»); отмена красится --danger: её нельзя пропустить.
const cancelledBadgeStyle: CSSProperties = {
  margin: '8px 0 0',
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
        <div style={listCardTitleStyle}>{lesson.classTitle}</div>
        <div style={listCardMetaStyle}>
          {formatDateTime(lesson.startsAt, timeZone)}
          {lesson.groupLabel && ` · ${lesson.groupLabel}`}
          {lesson.topic && ` · ${lesson.topic}`}
        </div>
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
      </div>
    </li>
  );
}
