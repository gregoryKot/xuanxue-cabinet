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
//
// Дата/название/тема и пометка отмены — общий LessonSummaryHeader.tsx
// (docs/PLAN.md §14 слой 3.3 завёл вторую строку занятия, ArchivedLessonCard.tsx,
// с тем же каркасом — CLAUDE.md «Одна механика — один компонент», jscpd
// поймал бы дубль).
import type { MyLessonDto } from '@xuanxue/shared';
import { LessonSummaryHeader, lessonRowStyle } from './LessonSummaryHeader';
import { StudentLessonMeeting } from './StudentLessonMeeting';

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
    <li
      style={{
        ...lessonRowStyle,
        borderBottom: isLast ? 'none' : '1px solid var(--panel)',
      }}
    >
      <LessonSummaryHeader
        startsAt={lesson.startsAt}
        classTitle={lesson.classTitle}
        groupLabel={lesson.groupLabel}
        topic={lesson.topic}
        cancelled={cancelled}
        timeZone={timeZone}
      />
      {!cancelled && (
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
