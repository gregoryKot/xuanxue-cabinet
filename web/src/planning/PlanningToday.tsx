// Обёртка над TodaySection — считает «сегодня» и «ближайшее» из уже
// загруженного списка занятий (pickTodayLessons, nextLesson.ts), чтобы
// PlanningScreen.tsx остался ≤150 строк (CLAUDE.md «Храповики»).
import { useMemo } from 'react';
import type { LessonDto } from '@xuanxue/shared';
import { nextLesson } from './nextLesson';
import { TodaySection } from './TodaySection';
import { pickTodayLessons } from './todayLessons';

interface PlanningTodayProps {
  lessons: LessonDto[] | null;
  classTitleById: Map<string, string>;
  onOpenLesson: (lessonId: string) => void;
}

export function PlanningToday({
  lessons,
  classTitleById,
  onOpenLesson,
}: PlanningTodayProps) {
  const today = useMemo(() => (lessons ? pickTodayLessons(lessons) : null), [lessons]);
  // Ближайшее занятие считаем, только когда список загружен и сегодня пусто —
  // иначе на каждый рендер во время загрузки летит лишний проход по массиву.
  const upcoming = useMemo(
    () => (lessons && today?.length === 0 ? nextLesson(lessons) : null),
    [lessons, today],
  );

  return (
    <TodaySection
      lessons={today}
      classTitleById={classTitleById}
      onOpenLesson={onOpenLesson}
      nextLesson={upcoming}
    />
  );
}
