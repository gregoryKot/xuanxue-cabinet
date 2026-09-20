// «Даты занятий» — первая секция экрана тега (ADR-0075): список дат с этим
// тегом, без окна планирования (ADR-0078, useLessonsByTag.ts). Строка —
// та же LessonCard.tsx, что и на «Занятиях» (CLAUDE.md «Одна механика —
// один компонент»): она сама показывает «запись есть», второй карточки
// занятия ради этого не заводим.
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ClassDto } from '@xuanxue/shared';
import { LessonCard } from '../planning/LessonCard';
import { TagSection } from './TagSection';
import { useLessonsByTag } from './useLessonsByTag';

const TITLE = 'Даты занятий';
const LESSON_EDITOR_PATH = '/planning';

interface TagLessonsSectionProps {
  tag: string;
  /** Названия занятий по id — школа хранит их в useClasses() на экране
   * (MaterialsTagsScreen.tsx), тот же приём, что у MaterialsScreen.tsx. */
  classes: ClassDto[];
}

export function TagLessonsSection({ tag, classes }: TagLessonsSectionProps) {
  const { lessons, loading, error, reload } = useLessonsByTag(tag);
  const navigate = useNavigate();
  const classTitleById = useMemo(
    () => new Map(classes.map((cls) => [cls.id, cls.title])),
    [classes],
  );

  return (
    <TagSection
      title={TITLE}
      items={lessons}
      loading={loading}
      error={error}
      onRetry={() => void reload()}
      emptyMessage={`Занятий с тегом «${tag}» пока нет.`}
      renderItem={(lesson, index, all) => (
        <LessonCard
          key={lesson.id}
          lesson={lesson}
          className={classTitleById.get(lesson.classId) ?? '—'}
          onSelect={() => void navigate(`${LESSON_EDITOR_PATH}/${lesson.id}`)}
          isLast={index === all.length - 1}
        />
      )}
    />
  );
}
