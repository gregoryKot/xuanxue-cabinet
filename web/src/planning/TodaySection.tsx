// Блок «Сегодня» — верх «Занятий»: что идёт сегодня, а если сегодня пусто —
// ближайшее занятие (отзыв владельца 2026-09-12, docs/adr/0025). Сбой
// загрузки списка сюда не приходит — тот же `lessonsState.error` уже показан
// одним баннером ниже, в PlanningScreen.tsx (два баннера на один сбой были бы
// лишним). Карточка занятия — та же, что и в списке на 4 недели ниже
// (CLAUDE.md «Одна механика — один компонент»), но без `id` (`anchor={false}`):
// тот же день уже отрисован там своей карточкой с якорем, два элемента с
// одним `id` ломают его (LessonCard.tsx). Клик здесь и там ведёт на одну и
// ту же страницу занятия — переходить по ссылке между ними больше незачем.
import type { CSSProperties } from 'react';
import type { LessonDto } from '@xuanxue/shared';
import { SkeletonList } from '../components/Skeleton';
import { LessonCard } from './LessonCard';

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

      {lessons === null && <SkeletonList rows={2} h={56} />}

      {lessons?.map((lesson) => (
        <LessonCard
          key={lesson.id}
          lesson={lesson}
          className={classTitleById.get(lesson.classId) ?? '—'}
          onSelect={() => onOpenLesson(lesson.id)}
          anchor={false}
        />
      ))}

      {lessons?.length === 0 && (
        <>
          <p style={nothingTodayStyle}>{NOTHING_TODAY}</p>
          {nextLesson && (
            <LessonCard
              lesson={nextLesson}
              className={classTitleById.get(nextLesson.classId) ?? '—'}
              onSelect={() => onOpenLesson(nextLesson.id)}
              anchor={false}
            />
          )}
        </>
      )}
    </section>
  );
}
