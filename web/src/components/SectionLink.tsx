// Переход в подэкран своего раздела — карточка с тонким контуром: заголовок
// и приписка под ним. Общий компонент для «Экзаменов»
// (exams/ExamsSectionStats.tsx), «Занятий» (planning/ScheduleLink.tsx) и
// «Рассылок» (broadcasts/BroadcastsScreen.tsx) — CLAUDE.md «Одна механика —
// один компонент»: три экрана открывают подэкран одним и тем же жестом,
// вторая реализация той же карточки разошлась бы в вёрстке и попалась бы
// jscpd.
//
// Раньше был текстовой ссылкой с волосяной линией сверху (направление «тихо
// и благородно», ADR-0031, отзыв владельца 2026-09-16). Направление «Тёплая
// школа» (docs/adr/0043) рисует такой переход снова карточкой — на макетах
// 2a/2b это прямоугольник с тонким контуром `--line-soft`, без тени и
// заливки: тень уже занята карточкой строки списка, заливка — тёплой
// плашкой на том же экране, и три одинаковых на вид блока подряд стало бы не
// отличить друг от друга. Кликабельна вся карточка, не только заголовок —
// цель нажатия крупнее 44×44 уже за счёт паддинга (CLAUDE.md «Доступность»).
import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';

const cardStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  padding: '16px 18px',
  borderRadius: 'var(--radius-block)',
  border: '1px solid var(--line-soft)',
  color: 'inherit',
  textDecoration: 'none',
};
const titleStyle: CSSProperties = { fontSize: 15, fontWeight: 500, color: 'var(--ink)' };
const hintStyle: CSSProperties = {
  margin: 0,
  fontSize: 13,
  lineHeight: 1.5,
  color: 'var(--ink-soft)',
};

export interface SectionLinkProps {
  to: string;
  title: string;
  hint: string;
}

export function SectionLink({ to, title, hint }: SectionLinkProps) {
  return (
    <Link to={to} style={cardStyle}>
      <span style={titleStyle}>{title}</span>
      <p style={hintStyle}>{hint}</p>
    </Link>
  );
}
