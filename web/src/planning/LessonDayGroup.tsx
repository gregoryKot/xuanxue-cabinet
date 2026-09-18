// Блок «заголовок дня + занятия этого дня» для «Занятий» — свой компонент
// вместо DaySlots (CLAUDE.md «Одна механика — один компонент»): DaySlots
// группирует по дню недели правила расписания, здесь — по календарной дате
// конкретные занятия, данные и типы разные.
//
// Заголовок дня — растяжка-заглавные `.xuanxue-eyebrow` (макет
// 1c-planning.html): дата служебная метка над списком, а не заголовок
// наравне с названием занятия. Занятия дня — одна карточка, не стопка строк
// со своей тенью каждая (docs/adr/0043): волосяную линию между строками
// красит сама LessonCard.tsx (проп `isLast`), `overflow: hidden` подрезает
// первую/последнюю строку под общий радиус — тот же приём, что у журнала
// рассылок и списка экзаменов/учеников (components/listCardStyles.ts:
// oneCardListStyle).
import type { CSSProperties } from 'react';
import type { ClassDto } from '@xuanxue/shared';
import { oneCardListStyle } from '../components/listCardStyles';
import { LessonCard } from './LessonCard';
import type { LessonDayGroupData } from './groupLessonsByDay';

const groupStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 10 };

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
      <ul style={oneCardListStyle}>
        {group.lessons.map((lesson, index) => {
          const cls = classesById.get(lesson.classId);
          return (
            <LessonCard
              key={lesson.id}
              lesson={lesson}
              className={cls?.title ?? '—'}
              onSelect={() => onSelectLesson(lesson.id)}
              isLast={index === group.lessons.length - 1}
            />
          );
        })}
      </ul>
    </div>
  );
}
