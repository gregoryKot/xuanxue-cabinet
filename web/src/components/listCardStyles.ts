// Общий стиль карточки-кнопки в списке (слот расписания, дата занятия) —
// CLAUDE.md «Одна механика — один компонент»: раньше объявлялся отдельно в
// schedule/SlotCard.tsx и planning/LessonCard.tsx, jscpd поймал дубль.
import type { CSSProperties } from 'react';

export const listCardStyle: CSSProperties = {
  display: 'block',
  width: '100%',
  textAlign: 'left',
  padding: '10px 12px',
  borderRadius: 12,
  border: '1px solid var(--border)',
  background: '#fff',
  font: 'inherit',
  cursor: 'pointer',
  minHeight: 44,
};

export const listCardTitleStyle: CSSProperties = { fontWeight: 600, fontSize: 14 };
export const listCardMetaStyle: CSSProperties = {
  fontSize: 13,
  color: 'var(--ink-soft)',
  marginTop: 2,
};
