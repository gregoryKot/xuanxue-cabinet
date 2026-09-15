// Общий стиль строки списка (слот расписания, дата занятия) — CLAUDE.md
// «Одна механика — один компонент»: раньше объявлялся отдельно в
// schedule/SlotCard.tsx и planning/LessonCard.tsx, jscpd поймал дубль.
//
// Направление «тихо и благородно» (docs/adr/0031-visual-direction-quiet-and-
// noble.md) заменило карточку с рамкой и заливкой на строку списка: волосяная
// линия только снизу, без фона и скругления — список читается как список, а
// не как стопка визиток. Заголовок строки — антиквой: так подписано «Занятие»
// или «Экзамен» отличимо от служебной строки метаданных под ним.
import type { CSSProperties } from 'react';

export const listCardStyle: CSSProperties = {
  display: 'block',
  width: '100%',
  textAlign: 'left',
  padding: '20px 4px',
  // `<button>` приносит свою рамку 2px outset со всех сторон, а `borderBottom`
  // ниже переопределяет только низ — три стороны оставались браузерными, и
  // список выглядел обведённым тёмной рамкой (снимок редактора 2026-09-15).
  border: 'none',
  borderRadius: 0,
  borderBottom: '1px solid var(--line)',
  background: 'transparent',
  font: 'inherit',
  cursor: 'pointer',
  minHeight: 44,
};

export const listCardTitleStyle: CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontWeight: 500,
  fontSize: 23,
};
export const listCardMetaStyle: CSSProperties = {
  fontSize: 13,
  color: 'var(--ink-soft)',
  marginTop: 4,
};
