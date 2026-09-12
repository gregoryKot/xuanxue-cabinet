// Карточка одной даты занятия в «Планировании» — время, класс, тема, статус
// (CLAUDE.md «Одна механика — один компонент», по образцу schedule/SlotCard.tsx).
// `id="lesson-{id}"` — якорь для внешней ссылки на конкретное занятие (бот,
// уведомление). Блок «Сегодня» на этом же экране (PlanningToday.tsx) рисует
// те же занятия ещё раз — там якорь выключают (`anchor={false}`), иначе два
// элемента с одним `id` ломают его и невалидны в HTML.
// Стиль карточки — общий с schedule/SlotCard.tsx (components/listCardStyles.ts).
import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import type { BroadcastStatus, LessonDto } from '@xuanxue/shared';
import {
  listCardMetaStyle,
  listCardStyle,
  listCardTitleStyle,
} from '../components/listCardStyles';
import { formatTime } from '../lib/formatDate';

// Свои тексты, не BROADCAST_STATUS_LABELS_RU (broadcasts/broadcastLabels.ts):
// там подпись общей карточки рассылки в журнале, здесь — что случилось со
// ссылкой конкретно этого занятия (docs/PLAN.md §6 п.3, VOICE.md — короткие
// тексты интерфейса без точки).
const BROADCAST_BADGE_TEXT: Record<BroadcastStatus, string> = {
  scheduled: 'Ссылка ждёт отправки',
  sent: 'Ссылка ушла',
  failed: 'Ошибка отправки',
  cancelled: 'Отменена',
};

const BROADCAST_BADGE_COLOR: Record<BroadcastStatus, string> = {
  scheduled: 'var(--ink-soft)',
  sent: 'var(--accent)',
  failed: 'var(--danger)',
  cancelled: 'var(--ink-soft)',
};

const cancelledLinkStyle: CSSProperties = {
  display: 'block',
  marginTop: 2,
  fontSize: 13,
  color: 'var(--ink-soft)',
};

interface LessonCardProps {
  lesson: LessonDto;
  className: string;
  onSelect: () => void;
  /** `false` — без DOM `id` (см. комментарий выше). По умолчанию `true`. */
  anchor?: boolean;
}

export function LessonCard({
  lesson,
  className,
  onSelect,
  anchor = true,
}: LessonCardProps) {
  const cancelled = lesson.status === 'cancelled';
  const broadcast = lesson.broadcast;
  return (
    <div>
      <button
        type="button"
        id={anchor ? `lesson-${lesson.id}` : undefined}
        style={{ ...listCardStyle, color: cancelled ? 'var(--ink-soft)' : 'inherit' }}
        onClick={onSelect}
      >
        <div style={listCardTitleStyle}>
          {formatTime(lesson.startsAt)} · {className}
        </div>
        <div style={listCardMetaStyle}>
          {lesson.topic || 'Тема не задана'}
          {cancelled && ' · Отменено'}
          {lesson.recordings.length > 0 && ' · запись есть'}
          {broadcast && (
            <>
              {' · '}
              <span style={{ color: BROADCAST_BADGE_COLOR[broadcast.status] }}>
                {BROADCAST_BADGE_TEXT[broadcast.status]}
              </span>
            </>
          )}
        </div>
      </button>
      {/* Ссылка отдельным элементом, не внутри <button>: вложенная
          интерактивная разметка невалидна и не кликабельна в браузере
          (кнопка перехватывает клик первой). */}
      {broadcast?.status === 'cancelled' && (
        <Link to="/broadcasts" style={cancelledLinkStyle}>
          почему — в «Рассылках»
        </Link>
      )}
    </div>
  );
}
