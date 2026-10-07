// Карточка-плюс «Добавить …» на доске: контур пунктиром, в отличие от
// сплошного контура карточек-переходов (SectionLink.tsx) — это не вход в
// раздел, а место, где записи пока нет или куда её можно добавить. Кликабельна
// вся карточка, цель ≥44 за счёт паддинга.
//
// Один компонент на два жеста (CLAUDE.md «Одна механика — один компонент»):
// объявление открывает диалог на месте (`onClick`, board/StaffBoardNotice.tsx),
// событие уходит на свою страницу (`to`, board/StaffBoardEvents.tsx) — первое
// кнопка, второе ссылка, вид один.
import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { RichText } from './RichText';

const addCardStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 14,
  width: '100%',
  boxSizing: 'border-box',
  padding: '14px 18px',
  borderRadius: 'var(--radius-block)',
  border: '1px dashed var(--control-border)',
  background: 'transparent',
  color: 'inherit',
  font: 'inherit',
  textAlign: 'left',
  textDecoration: 'none',
  cursor: 'pointer',
};
const plusStyle: CSSProperties = {
  fontSize: 26,
  lineHeight: 1,
  color: 'var(--terracotta-text)',
  flexShrink: 0,
};
const textStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2 };
const titleStyle: CSSProperties = { fontSize: 15, fontWeight: 500 };
const hintStyle: CSSProperties = { margin: 0, fontSize: 13, color: 'var(--ink-soft)' };

interface AddCardBaseProps {
  title: string;
  /** Одна строка о том, что получится; факт выделяется `**…**` (ADR-0124). */
  hint: string;
}

type AddCardProps = AddCardBaseProps &
  ({ to: string; onClick?: never } | { onClick: () => void; to?: never });

export function AddCard({ title, hint, to, onClick }: AddCardProps) {
  const content = (
    <>
      <span aria-hidden="true" style={plusStyle}>
        +
      </span>
      <span style={textStyle}>
        <span style={titleStyle}>{title}</span>
        <span style={hintStyle}>
          <RichText text={hint} />
        </span>
      </span>
    </>
  );

  if (to !== undefined) {
    return (
      <Link to={to} style={addCardStyle}>
        {content}
      </Link>
    );
  }
  return (
    <button type="button" style={addCardStyle} onClick={onClick}>
      {content}
    </button>
  );
}
