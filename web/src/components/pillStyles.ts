// Стиль пилюли-переключателя — общий на два места: строка фильтров
// (ListFilters.tsx, пилюли статуса и тега над списком) и строка материала у
// ученика (student/StudentMaterialCard.tsx, ADR-0068: тег в строке материала
// — тоже пилюля, ставит тот же фильтр библиотеки). Третьей копии не
// заводится (CLAUDE.md «Одна механика — один компонент», jscpd).
import type { CSSProperties } from 'react';

// Цель нажатия — 44×44, хотя пилюля в макете рисуется на глаз ~30px по
// высоте: паддинг и радиус остаются макетными, лишнюю высоту/ширину даёт сама
// цель нажатия вокруг видимой пилюли (тот же приём, что и в ADR-0043 для
// rowControlStyle — отклонение зафиксировано там же, CLAUDE.md «Доступность»).
// Рамка — раздельными полями (border-width/style/color), не шорткатом
// `border`: активное состояние меняет только цвет рамки, и React
// предупреждает при смене шортката на отдельное поле между рендерами (тот же
// приём, что раньше был у border-bottom-* здесь же).
export const pillStyle: CSSProperties = {
  minHeight: 44,
  minWidth: 44,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '7px 14px',
  borderRadius: 'var(--radius-pill)',
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: 'var(--control-border)',
  background: 'transparent',
  fontFamily: 'inherit',
  fontSize: 13,
  fontWeight: 400,
  color: 'var(--ink-soft)',
  cursor: 'pointer',
};
// Активный переключатель — заливка --ink целиком (не только цвет текста):
// правило «один акцент на экран» про терракоту, к чёрной заливке пилюли
// статуса не относится (это не акцент, а обычное состояние «выбрано», как
// активный пункт бокового меню). --ink-contrast — «бумага на туши», 13.68:1.
export const pillActiveStyle: CSSProperties = {
  borderColor: 'var(--ink)',
  background: 'var(--ink)',
  color: 'var(--ink-contrast)',
};
