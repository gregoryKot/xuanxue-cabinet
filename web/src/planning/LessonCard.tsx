// Строка одной даты занятия в «Занятиях» — время и класс антиквой, тема и
// пометки служебной строкой, состояние рассылки ссылки — меткой справа
// (макет Schedule.dc.html, направление docs/adr/0031). Каркас строки общий
// с schedule/SlotCard.tsx (components/listCardStyles.ts).
//
// `id="lesson-{id}"` — якорь для внешней ссылки на конкретное занятие (бот,
// уведомление). Блок «Сегодня» на этом же экране (PlanningToday.tsx) рисует
// те же занятия ещё раз — там якорь выключают (`anchor={false}`), иначе два
// элемента с одним `id` ломают его и невалидны в HTML.
import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import type { BroadcastStatus, LessonDto } from '@xuanxue/shared';
import {
  listCardMetaStyle,
  listCardStyle,
  listCardTitleStyle,
} from '../components/listCardStyles';
import { textLinkStyle } from '../components/screenLayout';
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

// Киноварью метка не красится ни в одном состоянии: акцент экрана занят
// кнопкой «Разовое занятие», а «Ссылка ушла» повторяется в каждой строке
// списка — четыре недели красного (правило акцента, docs/adr/0031). Цветом
// выделен только сбой: он требует действия учителя.
const failedBadgeStyle: CSSProperties = { color: 'var(--danger)' };

const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: 16,
};
const contentStyle: CSSProperties = { minWidth: 0, flex: 1 };
// Информационный текст — --ink-soft, не --ink-faint (CLAUDE.md
// «Доступность»: у --ink-faint контраст с бумагой ниже AA).
const badgeStyle: CSSProperties = {
  flexShrink: 0,
  color: 'var(--ink-soft)',
  paddingTop: 6,
};
const cancelledLinkStyle: CSSProperties = {
  ...textLinkStyle,
  display: 'inline-block',
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
        <div style={rowStyle}>
          <div style={contentStyle}>
            <div style={listCardTitleStyle}>
              {formatTime(lesson.startsAt)} · {className}
            </div>
            <div style={listCardMetaStyle}>
              {lesson.topic || 'Тема не задана'}
              {cancelled && ' · Отменено'}
              {lesson.recordings.length > 0 && ' · запись есть'}
            </div>
          </div>
          {broadcast && (
            <span
              className="xuanxue-status-label"
              style={
                broadcast.status === 'failed'
                  ? { ...badgeStyle, ...failedBadgeStyle }
                  : badgeStyle
              }
            >
              {BROADCAST_BADGE_TEXT[broadcast.status]}
            </span>
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
