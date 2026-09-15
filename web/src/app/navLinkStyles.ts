// Стили навигации, вынесены из AppNav.tsx (CLAUDE.md «Храповики»: компонент
// за 150 строк — выноси хуки и подкомпоненты). Направление «тихо и
// благородно» (docs/adr/0031-visual-direction-quiet-and-noble.md) убрало
// заливку активного пункта — вместо неё полужирный текст тушью и киноварная
// точка слева/сверху: акцент экрана здесь ровно один — сам факт «вы здесь».
import type { CSSProperties } from 'react';

export const SIDE_NAV_WIDTH_PX = 208;
const NAV_DOT_SIZE_PX = 5;

export const bottomStyle: CSSProperties = {
  display: 'flex',
  borderTop: '1px solid var(--line)',
  background: 'var(--paper)',
  // Панель прибита к низу экрана, а не уезжает вверх вместе со списком
  // (отзыв владельца 2026-09-10). sticky, а не fixed: элемент остаётся в
  // потоке последним в колонке AppShell, поэтому под него не нужна распорка по
  // высоте — контент не залезает под панель на последнем экране списка.
  position: 'sticky',
  bottom: 0,
  // Выше карточек и листов расписания, ниже тоста обновления (zIndex 100).
  zIndex: 10,
  // Полоска «Домой» на iPhone лежала прямо на подписях (отзыв владельца
  // 2026-09-12, скриншот: «План» и «Каналы» перечёркнуты). Без медиазапроса
  // на display-mode: env() сам отдаёт 0 там, где безопасной зоны нет, —
  // пустоты в обычном браузере не появляется, а в установленном приложении
  // подписи выходят из-под полоски.
  paddingBottom: 'env(safe-area-inset-bottom)',
};

export const sideStyle: CSSProperties = {
  width: SIDE_NAV_WIDTH_PX,
  flexShrink: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  padding: 12,
  borderRight: '1px solid var(--line)',
  background: 'var(--paper)',
};

export const bottomLinkStyle = (isActive: boolean): CSSProperties => ({
  flex: 1,
  // `minWidth: 0` — иначе flex-item не сжимается уже своего содержимого, и
  // четыре подписи на 360px толкают body в горизонтальный скролл
  // (pr-k3-fixes.md п.10): вместе с overflowWrap подписи ниже это держит
  // навигацию в ширине экрана без теста на ширину — проверка стилями, не
  // пикселями.
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 4,
  padding: '10px 4px',
  minHeight: 48,
  textDecoration: 'none',
  color: isActive ? 'var(--ink)' : 'var(--ink-soft)',
  fontWeight: isActive ? 600 : 400,
});

export const sideLinkStyle = (isActive: boolean): CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '10px 12px',
  minHeight: 44,
  borderRadius: 3,
  textDecoration: 'none',
  color: isActive ? 'var(--ink)' : 'var(--ink-soft)',
  fontWeight: isActive ? 600 : 400,
});

export const bottomLabelStyle: CSSProperties = {
  fontSize: 13,
  lineHeight: 1.2,
  textAlign: 'center',
  overflowWrap: 'anywhere',
};

/** Киноварная точка «вы здесь» — единственный акцент на пункте (правило
 * акцента, CLAUDE.md): в боковой колонке — перед подписью (flex-row, gap
 * ставит отступ сам), в нижней панели телефона — между иконкой и подписью
 * (flex-column, тот же gap). `aria-hidden` — активность уже читает
 * `aria-current` на самой ссылке, дублировать нечем скринридеру. */
export const navDotStyle: CSSProperties = {
  width: NAV_DOT_SIZE_PX,
  height: NAV_DOT_SIZE_PX,
  borderRadius: '50%',
  background: 'var(--cinnabar)',
  flexShrink: 0,
};
