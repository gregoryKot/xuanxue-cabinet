// Блок «заголовок дня + занятия этого дня» для «Занятий» — свой компонент
// вместо DaySlots (CLAUDE.md «Одна механика — один компонент»): DaySlots
// группирует по дню недели правила расписания, здесь — по календарной дате
// конкретные занятия, данные и типы разные.
//
// Заголовок дня — растяжка-заглавные `.xuanxue-eyebrow` (макет
// Schedule.dc.html): дата служебная метка над списком, а не заголовок
// наравне с названием занятия.
import type { CSSProperties } from 'react';
import type { ClassDto } from '@xuanxue/shared';
import { LessonCard } from './LessonCard';
import type { LessonDayGroupData } from './groupLessonsByDay';

const groupStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4 };

interface LessonDayGroupProps {
  group: LessonDayGroupData;
  classesById: Map<string, ClassDto>;
  onSelectLesson: (lessonId: string) => void;
}

export function LessonDayGroup({
  group,
  classesById,
  onSelectLesson,
}: LessonDayGroupProps) {
  return (
    <div style={groupStyle}>
      <span className="xuanxue-eyebrow">{group.heading}</span>
      {group.lessons.map((lesson) => {
        const cls = classesById.get(lesson.classId);
        return (
          <LessonCard
            key={lesson.id}
            lesson={lesson}
            className={cls?.title ?? '—'}
            onSelect={() => onSelectLesson(lesson.id)}
          />
        );
      })}
    </div>
  );
}
