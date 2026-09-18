// Блок «Сегодня» — верх «Занятий»: что идёт сегодня, а если сегодня пусто —
// ближайшее занятие (отзыв владельца 2026-09-12, docs/adr/0025). Сбой
// загрузки списка сюда не приходит — тот же `lessonsState.error` уже показан
// одним баннером ниже, в PlanningScreen.tsx (два баннера на один сбой были бы
// лишним). Карточки — крупные, сеткой `.xuanxue-today-grid` (макет
// 1c-planning.html, docs/adr/0043) — своя карточка TodayLessonCard.tsx, не
// строка списка на 4 недели ниже (LessonCard.tsx): тот же день там уже
// отрисован в общей карточке дня, и вид у «Сегодня» крупнее нарочно. Клик
// здесь и там ведёт на одну и ту же страницу занятия.
import type { CSSProperties } from 'react';
import type { LessonDto } from '@xuanxue/shared';
import { SkeletonList } from '../components/Skeleton';
import { TodayLessonCard } from './TodayLessonCard';

const HEADING = 'Сегодня';
const NOTHING_TODAY = 'Сегодня занятий нет.';
// Ближайшее занятие идёт строкой сразу под этой фразой — отступ отделяет её
// от заголовка дня, который иначе слипается с меткой «Сегодня».
const nothingTodayStyle: CSSProperties = { margin: '4px 0 0' };

const sectionStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4 };

interface TodaySectionProps {
  /** `null` — занятия ещё грузятся. */
  lessons: LessonDto[] | null;
  classTitleById: Map<string, string>;
  onOpenLesson: (lessonId: string) => void;
  /** Ближайшее занятие после сегодня — только когда сегодня пусто. */
  nextLesson: LessonDto | null;
}

export function TodaySection({
  lessons,
  classTitleById,
  onOpenLesson,
  nextLesson,
}: TodaySectionProps) {
  return (
    <section style={sectionStyle}>
      <span className="xuanxue-eyebrow">{HEADING}</span>

      {lessons === null && <SkeletonList rows={2} h={112} />}

      {lessons && lessons.length > 0 && (
        <div className="xuanxue-today-grid">
          {lessons.map((lesson) => (
            <TodayLessonCard
              key={lesson.id}
              lesson={lesson}
              className={classTitleById.get(lesson.classId) ?? '—'}
              onSelect={() => onOpenLesson(lesson.id)}
            />
          ))}
        </div>
      )}

      {lessons?.length === 0 && (
        <>
          <p style={nothingTodayStyle}>{NOTHING_TODAY}</p>
          {nextLesson && (
            <div className="xuanxue-today-grid">
              <TodayLessonCard
                lesson={nextLesson}
                className={classTitleById.get(nextLesson.classId) ?? '—'}
                onSelect={() => onOpenLesson(nextLesson.id)}
              />
            </div>
          )}
        </>
      )}
    </section>
  );
}
