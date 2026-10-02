// Стили строки занятия «Расписания» (SlotRow.tsx) — вынесены, чтобы
// компонент остался под 150 строк храповика (CLAUDE.md «Храповики»).
import type { CSSProperties } from 'react';

const buttonBaseStyle: CSSProperties = {
  width: '100%',
  minHeight: 44,
  border: 'none',
  background: 'transparent',
  font: 'inherit',
  color: 'inherit',
  textAlign: 'left',
  cursor: 'pointer',
};
// Время колонкой слева, как в бумажном расписании; ширина колонки — под
// «20:00» кеглем 17 с запасом.
export const rowStyle: CSSProperties = {
  ...buttonBaseStyle,
  display: 'grid',
  gridTemplateColumns: '52px minmax(0, 1fr)',
  columnGap: 14,
  padding: '14px 16px',
};
// Цифры — Golos Text с моноширинными цифрами, не антиква: у Cormorant
// старостильные цифры, и «08:00» читалось набором случайных высот (ADR-0043).
export const startStyle: CSSProperties = {
  fontSize: 17,
  fontWeight: 500,
  lineHeight: 1.2,
  fontVariantNumeric: 'tabular-nums',
};
export const endStyle: CSSProperties = {
  fontSize: 13,
  color: 'var(--ink-soft)',
  fontVariantNumeric: 'tabular-nums',
};
export const timeStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
};
export const bodyStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  minWidth: 0,
};
// Название и подпись группы — свободный текст (до 120 и 60 знаков): слово
// длиннее строки рвётся, а не вылезает за карточку.
export const titleStyle: CSSProperties = {
  fontWeight: 500,
  lineHeight: 1.3,
  overflowWrap: 'anywhere',
};
export const groupStyle: CSSProperties = { fontWeight: 400, color: 'var(--ink-soft)' };
// Информационный текст — --ink-soft, не --ink-faint (CLAUDE.md
// «Доступность»: у --ink-faint контраст с бумагой ниже AA).
export const placeRowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  columnGap: 10,
  rowGap: 2,
  fontSize: 13,
  color: 'var(--ink-soft)',
  overflowWrap: 'anywhere',
};
// Значок по первой строке текста, а не по середине: длинный адрес
// переносится, и значок по центру висел бы между строк.
export const placePartStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'flex-start',
  gap: 5,
  lineHeight: '18px',
};
export const tagsStyle: CSSProperties = {
  fontSize: 13,
  color: 'var(--ink-soft)',
  overflowWrap: 'anywhere',
};
export const statusRowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 10,
  marginTop: 2,
  color: 'var(--ink-soft)',
};
export const dangerStatusStyle: CSSProperties = { color: 'var(--danger)' };
