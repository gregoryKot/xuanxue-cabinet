// Ближайшее занятие ученика крупно — первое, что видно после входа (макет
// 1c-planning.html, docs/adr/0043). Карточка с тенью — не строка с волосяной
// линией (направление docs/adr/0031 ушло): рубрика терракотой совмещает день
// и статус времени (lib/lessonCountdown.ts) — «Сегодня, через 4 часа»; для
// дня, отличного от сегодня, счёт в часах не показываем (тот же приём, что у
// planning/TodayLessonCard.tsx на экране учителя). Время антиквой уступило
// место гротеску табличными цифрами — общий сдвиг «Тёплой школы» с антиквы на
// цифрах на интерфейсный гротеск. Остальные занятия идут строками ниже
// (StudentLessonCard.tsx) — здесь нарочно другая, крупная форма: ученик
// пришёл узнать, когда ближайшее занятие, а не читать список.
import type { CSSProperties } from 'react';
import type { MyLessonDto } from '@xuanxue/shared';
import { formatTime } from '../lib/formatDate';
import { capitalize, relativeDayLabel } from '../lib/relativeDay';
import { lessonCountdownLabel } from '../lib/lessonCountdown';
import { StudentLessonMeeting } from './StudentLessonMeeting';

const CANCELLED_TEXT = 'Занятие отменено';
// Тень заметнее обычной --shadow-card (0 1px 3px): это единственная карточка-
// герой экрана ученика, и макет рисует её отдельным, более выразительным
// числом — третью тень ради одного места не заводим токеном (тот же довод,
// что у --radius-block ниже, docs/adr/0043).
const HERO_SHADOW = '0 2px 6px rgba(36, 40, 31, 0.08)';

const cardStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  padding: 20,
  borderRadius: 'var(--radius-block)',
  background: 'var(--card)',
  boxShadow: HERO_SHADOW,
};
// --terracotta-text, не --terracotta: та же рубрика кеглем 13px, где нужен
// AA 4.5 — заливка его не держит (docs/adr/0043 «Отклонения от макета»).
const rubricStyle: CSSProperties = {
  fontSize: 13,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: 'var(--terracotta-text)',
};
const timeStyle: CSSProperties = {
  fontSize: 28,
  fontWeight: 500,
  fontVariantNumeric: 'tabular-nums',
  color: 'var(--ink)',
};
const titleStyle: CSSProperties = { fontFamily: 'var(--font-display)', fontSize: 24 };
const metaStyle: CSSProperties = { fontSize: 14, color: 'var(--ink-soft)' };
const cancelledStyle: CSSProperties = {
  margin: '8px 0 0',
  fontSize: 13,
  color: 'var(--danger)',
};

interface StudentNextLessonProps {
  lesson: MyLessonDto;
  /** Пояс и «сейчас» — только тестам нужны фиксированные (CI гоняет vitest
   * ещё и под TZ=Australia/Sydney, CLAUDE.md «Время»); экрану подходят
   * браузерный пояс и текущий момент. */
  timeZone?: string;
  nowIso?: string;
}

export function StudentNextLesson({ lesson, timeZone, nowIso }: StudentNextLessonProps) {
  const cancelled = lesson.status === 'cancelled';
  const now = nowIso ?? new Date().toISOString();
  const meta = [lesson.groupLabel, lesson.topic].filter(Boolean).join(' · ');

  const day = capitalize(relativeDayLabel(lesson.startsAt, now, timeZone));
  const countdown = lessonCountdownLabel(lesson.startsAt, now, timeZone);
  const rubric = countdown ? `${day}, ${countdown}` : day;

  return (
    <div style={cardStyle}>
      <span style={rubricStyle}>{rubric}</span>
      <span style={timeStyle}>{formatTime(lesson.startsAt, timeZone)}</span>
      <span style={titleStyle}>{lesson.classTitle}</span>
      {meta && <span style={metaStyle}>{meta}</span>}
      {cancelled ? (
        <p style={cancelledStyle}>{CANCELLED_TEXT}</p>
      ) : (
        <StudentLessonMeeting
          format={lesson.format}
          location={lesson.location}
          zoomLink={lesson.zoomLink}
          zoomPassword={lesson.zoomPassword}
          prominent
        />
      )}
    </div>
  );
}
