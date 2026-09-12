// Первое, что видит учитель после входа: что у него сегодня (отзыв владельца
// 2026-09-12 — «Сводка» показывала числа за месяц, а сегодняшний день был
// одной плиткой в конце). Карточка занятия — та же, что в «Занятиях»
// (CLAUDE.md «Одна механика — один компонент»): время, класс, тема и что
// стало со ссылкой.
import type { CSSProperties } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { LessonDto, NextLessonSummary } from '@xuanxue/shared';
import { LoadErrorBanner } from '../components/LoadErrorBanner';
import { SkeletonList } from '../components/Skeleton';
import { formatDateTime } from '../lib/formatDate';
import { LessonCard } from '../planning/LessonCard';

const HEADING = 'Сегодня';
const NOTHING_TODAY = 'Сегодня занятий нет.';

const sectionStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 8 };
const headingStyle: CSSProperties = {
  fontWeight: 600,
  fontSize: 13,
  color: 'var(--ink-soft)',
};

interface TodaySectionProps {
  /** `null` — занятия ещё грузятся. */
  lessons: LessonDto[] | null;
  classTitleById: Map<string, string>;
  error: string | null;
  onRetry: () => void;
  nextLesson?: NextLessonSummary;
}

export function TodaySection({
  lessons,
  classTitleById,
  error,
  onRetry,
  nextLesson,
}: TodaySectionProps) {
  const navigate = useNavigate();

  return (
    <section style={sectionStyle}>
      <span style={headingStyle}>{HEADING}</span>

      {error && <LoadErrorBanner message={error} onRetry={onRetry} />}

      {!error && lessons === null && <SkeletonList rows={2} h={56} />}

      {!error &&
        lessons?.map((lesson) => (
          <LessonCard
            key={lesson.id}
            lesson={lesson}
            className={classTitleById.get(lesson.classId) ?? '—'}
            onSelect={() => void navigate(`/planning#lesson-${lesson.id}`)}
          />
        ))}

      {!error && lessons?.length === 0 && (
        <p style={{ margin: 0 }}>
          {NOTHING_TODAY}
          {nextLesson && (
            <>
              {' Ближайшее — '}
              <Link to={`/planning#lesson-${nextLesson.lessonId}`}>
                {formatDateTime(nextLesson.startsAt)}, {nextLesson.title}
              </Link>
              .
            </>
          )}
        </p>
      )}
    </section>
  );
}
