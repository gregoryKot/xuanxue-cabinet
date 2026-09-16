// Ближайшее занятие ученика крупно — первое, что видно после входа (макет
// Student.dc.html, направление docs/adr/0031). Время антиквой в 40 пунктов,
// рядом «сегодня»/«завтра»/дата словами, ниже название и одно главное
// действие: «Подключиться». Остальные занятия идут строками ниже
// (StudentLessonCard.tsx) — здесь нарочно другая, крупная форма: ученик
// пришёл узнать, когда ближайшее занятие, а не читать список.
import type { CSSProperties } from 'react';
import type { MyLessonDto } from '@xuanxue/shared';
import { formatTime } from '../lib/formatDate';
import { relativeDayLabel } from '../lib/relativeDay';
import { StudentLessonMeeting } from './StudentLessonMeeting';

const CANCELLED_TEXT = 'Занятие отменено';

const wrapStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  paddingBottom: 22,
  borderBottom: '1px solid var(--line)',
};
const timeRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'baseline',
  flexWrap: 'wrap',
  gap: 10,
};
const timeStyle: CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontWeight: 400,
  fontSize: 40,
  lineHeight: 1,
  color: 'var(--ink)',
};
const dayStyle: CSSProperties = { fontSize: 14, color: 'var(--ink-soft)' };
const titleStyle: CSSProperties = { fontSize: 16, lineHeight: 1.45 };
const metaStyle: CSSProperties = { fontSize: 13, color: 'var(--ink-soft)' };
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

  return (
    <div style={wrapStyle}>
      <div style={timeRowStyle}>
        <span style={timeStyle}>{formatTime(lesson.startsAt, timeZone)}</span>
        <span style={dayStyle}>{relativeDayLabel(lesson.startsAt, now, timeZone)}</span>
      </div>
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
