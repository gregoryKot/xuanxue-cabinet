// Статус рассылки-ссылки занятия — общий кусок LessonCard.tsx (строка дня,
// бейдж справа) и TodayLessonCard.tsx (карточка «Сегодня», бейдж отдельной
// строкой): раньше был скопирован в оба места, jscpd поймал дубль (CLAUDE.md
// «Одна механика — один компонент»).
//
// Бейдж и ссылка «почему — в Рассылках» — разные компоненты, не один с
// Fragment: бейдж стоит ВНУТРИ кликабельной карточки (кнопки), ссылка —
// СНАРУЖИ неё (вложенная интерактивная разметка невалидна и не кликабельна в
// браузере — кнопка перехватывает клик первой), и оба места держат этот
// порядок сами.
import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import type { LessonDto } from '@xuanxue/shared';
import { textLinkStyle } from '../components/screenLayout';
import { LESSON_BROADCAST_COLOR, LESSON_BROADCAST_TEXT } from './lessonBroadcastStatus';

const cancelledLinkStyle: CSSProperties = {
  ...textLinkStyle,
  display: 'inline-block',
  marginTop: 2,
  fontSize: 13,
  color: 'var(--ink-soft)',
};

interface LessonBroadcastBadgeProps {
  broadcast: LessonDto['broadcast'];
  /** Своё позиционирование в каждом месте — справа от строки (LessonCard.tsx)
   * или отдельной строкой под описанием (TodayLessonCard.tsx). */
  style: CSSProperties;
}

export function LessonBroadcastBadge({ broadcast, style }: LessonBroadcastBadgeProps) {
  if (!broadcast) return null;
  return (
    <span style={{ ...style, color: LESSON_BROADCAST_COLOR[broadcast.status] }}>
      {LESSON_BROADCAST_TEXT[broadcast.status]}
    </span>
  );
}

export function CancelledBroadcastLink() {
  return (
    <Link to="/broadcasts" style={cancelledLinkStyle}>
      почему — в «Рассылках»
    </Link>
  );
}
