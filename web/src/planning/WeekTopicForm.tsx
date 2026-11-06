// Форма страницы «Тема недели» (ADR-0197): текст темы и галочки занятий одной
// недели. Сохранение пишет тему в отмеченные занятия одним запросом; уже
// ушедший пост не меняется — это сказано в шапке страницы.
import { useMemo, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LESSON_LIMITS, type ClassDto, type LessonDto } from '@xuanxue/shared';
import { Button } from '../components/Button';
import { CheckboxListField } from '../components/CheckboxListField';
import { editorActionsRowStyle, editorPageStyle } from '../components/editorLayout';
import { Field, inputStyle } from '../components/Field';
import { FormServerError } from '../components/FormServerError';
import { RichText } from '../components/RichText';
import { textLinkStyle } from '../components/screenLayout';
import { formatDayHeading, formatTime } from '../lib/formatDate';
import { useWeekTopic } from './useWeekTopic';

const SCHEDULE_PATH = '/schedule';
const EMPTY_LESSONS_MESSAGE = 'На этой неделе занятий нет.';
const EMPTY_TOPIC_HINT = 'Пустая тема снимет тему у отмеченных занятий.';
const NO_CLASS_NAME = '—';

interface WeekTopicFormProps {
  lessons: LessonDto[];
  classesById: Map<string, ClassDto>;
}

function optionHint(lesson: LessonDto): string | undefined {
  const parts = [
    lesson.status === 'cancelled' ? 'отменено' : null,
    lesson.topic ? `Сейчас: ${lesson.topic}` : null,
  ].filter((part) => part !== null);
  return parts.length > 0 ? parts.join(' · ') : undefined;
}

/** «Вт, 19:00 · Название класса». Заголовок дня — «Вт, 10 ноября»: берём
 * из него только день недели. */
function optionLabel(lesson: LessonDto, cls: ClassDto | undefined): string {
  const weekday = formatDayHeading(lesson.startsAt).split(',')[0];
  return `${weekday}, ${formatTime(lesson.startsAt)} · ${cls?.title ?? NO_CLASS_NAME}`;
}

export function WeekTopicForm({ lessons, classesById }: WeekTopicFormProps) {
  const navigate = useNavigate();
  const form = useWeekTopic(lessons);
  const options = useMemo(
    () =>
      [...lessons]
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
        .map((lesson) => ({
          id: lesson.id,
          label: optionLabel(lesson, classesById.get(lesson.classId)),
          hint: optionHint(lesson),
        })),
    [lessons, classesById],
  );

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (await form.submit()) void navigate(SCHEDULE_PATH);
  }

  return (
    <form style={editorPageStyle} onSubmit={(e) => void handleSubmit(e)}>
      <Field label="Тема" hint={EMPTY_TOPIC_HINT}>
        <input
          type="text"
          style={inputStyle}
          value={form.topic}
          maxLength={LESSON_LIMITS.topic}
          onChange={(e) => form.setTopic(e.target.value)}
        />
      </Field>
      <CheckboxListField
        legend="Занятия недели"
        options={options}
        selectedIds={form.selectedIds}
        onChange={form.setSelectedIds}
        emptyMessage={<RichText text={EMPTY_LESSONS_MESSAGE} />}
        error={form.selectionError ?? undefined}
      />
      <FormServerError error={form.serverError} />
      <div style={editorActionsRowStyle}>
        <Button type="submit" pending={form.pending}>
          Сохранить
        </Button>
        <Link to={SCHEDULE_PATH} style={textLinkStyle}>
          Назад
        </Link>
      </div>
    </form>
  );
}
