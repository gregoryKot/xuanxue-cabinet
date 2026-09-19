// Крупная карточка «Сегодня» на «Занятиях» (макет 1c-planning.html,
// docs/adr/0043) — своя карточка с тенью, а не строка списка: ровно две (или
// сколько есть сегодня) стоят рядом сеткой `.xuanxue-today-grid`
// (TodaySection.tsx). Рубрика совмещает день, время и статус времени
// (lib/lessonCountdown.ts) — «Сегодня, 19:00 · через 4 часа»; для карточки
// ближайшего занятия другого дня (сегодня пусто) счёт в часах не показываем
// (lessonCountdownLabel сам возвращает `null` для не-сегодня).
//
// Текст и цвет статуса рассылки — общий с LessonCard.tsx (бейдж и ссылка
// отменённой вынесены в LessonBroadcastBadge.tsx, jscpd поймал дубль).
// Точного времени отправки в LessonDto нет (только статус), поэтому «Ссылка
// ушла в 06:30» из макета мы не показываем — это придумало бы факт, которого
// кабинет не знает (см. отчёт PR).
import type { CSSProperties } from 'react';
import type { LessonDto } from '@xuanxue/shared';
import { capitalize, relativeDayLabel } from '../lib/relativeDay';
import { formatTime } from '../lib/formatDate';
import { lessonCountdownLabel } from '../lib/lessonCountdown';
import { CancelledBroadcastLink, LessonBroadcastBadge } from './LessonBroadcastBadge';

const cardStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  // 6, а не 4: под названием антиквой кеглем 25 четыре пикселя почти не
  // читаются, и строка темы липла к заголовку (отзыв владельца 2026-09-19).
  gap: 6,
  width: '100%',
  minHeight: 44,
  padding: '18px 20px',
  border: 'none',
  borderRadius: 'var(--radius-block)',
  background: 'var(--card)',
  boxShadow: 'var(--shadow-card)',
  font: 'inherit',
  textAlign: 'left',
  cursor: 'pointer',
};
const titleStyle: CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: 25,
  color: 'var(--ink)',
};
const descriptionStyle: CSSProperties = { fontSize: 14, color: 'var(--ink-soft)' };
// Своего отступа сверху не нужно: зазор колонки (cardStyle.gap) уже общий.
const statusStyle: CSSProperties = { fontSize: 13 };

interface TodayLessonCardProps {
  lesson: LessonDto;
  className: string;
  onSelect: () => void;
  /** Пояс и «сейчас» — тестам нужны фиксированные (CI гоняет vitest ещё и под
   * TZ=Australia/Sydney, CLAUDE.md «Время»); карточке на экране подходят
   * браузерный пояс и текущий момент. */
  timeZone?: string;
  nowIso?: string;
}

export function TodayLessonCard({
  lesson,
  className,
  onSelect,
  timeZone,
  nowIso,
}: TodayLessonCardProps) {
  const now = nowIso ?? new Date().toISOString();
  const cancelled = lesson.status === 'cancelled';
  const broadcast = lesson.broadcast;

  const day = capitalize(relativeDayLabel(lesson.startsAt, now, timeZone));
  const time = formatTime(lesson.startsAt, timeZone);
  const countdown = lessonCountdownLabel(lesson.startsAt, now, timeZone);
  const eyebrow = countdown ? `${day}, ${time} · ${countdown}` : `${day}, ${time}`;

  return (
    <div>
      <button
        type="button"
        style={{ ...cardStyle, color: cancelled ? 'var(--ink-soft)' : 'inherit' }}
        onClick={onSelect}
      >
        <span className="xuanxue-eyebrow">{eyebrow}</span>
        <span style={titleStyle}>{className}</span>
        <span style={descriptionStyle}>
          {lesson.topic || 'Тема не задана'}
          {cancelled && ' · Отменено'}
          {lesson.recordings.length > 0 && ' · запись есть'}
        </span>
        <LessonBroadcastBadge broadcast={broadcast} style={statusStyle} />
      </button>
      {broadcast?.status === 'cancelled' && <CancelledBroadcastLink />}
    </div>
  );
}
