// Карточка одной даты занятия в «Планировании» — время, класс, тема, статус
// (CLAUDE.md «Одна механика — один компонент», по образцу schedule/SlotCard.tsx).
// `id="lesson-{id}"` — якорь для ссылки со «Сводки» на конкретное занятие.
// Стиль карточки — общий с schedule/SlotCard.tsx (components/listCardStyles.ts).
import type { LessonDto } from '@xuanxue/shared';
import {
  listCardMetaStyle,
  listCardStyle,
  listCardTitleStyle,
} from '../components/listCardStyles';
import { formatTime } from '../lib/formatDate';

interface LessonCardProps {
  lesson: LessonDto;
  className: string;
  tzBadgeText: string | null;
  onSelect: () => void;
}

export function LessonCard({
  lesson,
  className,
  tzBadgeText,
  onSelect,
}: LessonCardProps) {
  const cancelled = lesson.status === 'cancelled';
  return (
    <button
      type="button"
      id={`lesson-${lesson.id}`}
      style={{ ...listCardStyle, color: cancelled ? 'var(--ink-soft)' : 'inherit' }}
      onClick={onSelect}
    >
      <div style={listCardTitleStyle}>
        {formatTime(lesson.startsAt)}
        {tzBadgeText && ` · ${tzBadgeText}`} · {className}
      </div>
      <div style={listCardMetaStyle}>
        {lesson.topic || 'Тема не задана'}
        {cancelled && ' · Отменено'}
        {lesson.recordings.length > 0 && ' · запись есть'}
      </div>
    </button>
  );
}
