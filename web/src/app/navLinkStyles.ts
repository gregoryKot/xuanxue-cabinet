// Стили навигации, вынесены из AppNav.tsx (CLAUDE.md «Храповики»: компонент
// за 150 строк — выноси хуки и подкомпоненты). Направление «Тёплая школа»
// (docs/adr/0043-visual-direction-warm-school.md, заменил ADR-0031) сняло
// заливку строки и киноварную точку «вы здесь»: у активного пункта теперь
// белая плашка с мягкой тенью. У самой колонки больше нет `border-right` —
// на мониторе владельца эта линейка тянулась вдоль 900px пустоты под
// четырьмя пунктами (ADR-0043 «Контекст»); границу заменяет контраст плашки
// активного пункта с прозрачным фоном вокруг.
import type { CSSProperties } from 'react';

// 236, не 208: колонка выросла вместе с макетом (ADR-0043) — на 208px блок
// человека переносил «Уведомления · Выйти» на две строки.
export const SIDE_NAV_WIDTH_PX = 236;

export const sideStyle: CSSProperties = {
  width: SIDE_NAV_WIDTH_PX,
  flexShrink: 0,
  padding: '22px 16px',
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
};

/** Сами пункты внутри колонки — отдельный `<nav>`, чтобы ориентир «Разделы
 * кабинета» не захватывал знак школы и блок человека (AppNav.tsx). Тот же
 * `gap`, что у колонки: визуально столбец остаётся единым, как в макете. */
export const sideSectionsStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
};

/** Знак школы и название — первая строка боковой колонки (AppNav.tsx). */
export const sideBrandRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '6px 10px 22px',
};

export const sideBrandTitleStyle: CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: 20,
  color: 'var(--ink)',
};

export const sideLinkStyle = (isActive: boolean): CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  padding: '12px 14px',
  // Макет не задаёт высоту явно: 12+12 паддинга и кегль 15 дают около 42px —
  // ниже цели нажатия 44px (CLAUDE.md «Доступность»). Отклонение от макета
  // зафиксировано в ADR-0043 «Отклонения от макета».
  minHeight: 44,
  borderRadius: 'var(--radius-control)',
  textDecoration: 'none',
  fontSize: 15,
  color: isActive ? 'var(--ink)' : 'var(--ink-soft)',
  fontWeight: isActive ? 500 : 400,
  background: isActive ? 'var(--card)' : 'transparent',
  boxShadow: isActive ? 'var(--shadow-pill)' : 'none',
});

/** Блок человека — низ боковой колонки, `margin-top: auto` отжимает его
 * туда при любом числе пунктов выше. Ссылка «Уведомления» и кнопка «Выйти»
 * приходят в AppNav.tsx готовыми узлами через пропсы: колонка их не создаёт
 * сама, иначе навигация начала бы знать про авторизацию (CLAUDE.md «Логика
 * вне компонентов»). */
export const personBlockStyle: CSSProperties = {
  marginTop: 'auto',
  padding: '12px 14px',
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  fontSize: 13,
  lineHeight: 1.6,
  color: 'var(--ink-soft)',
};

/** Строка «Уведомления · Выйти» внутри блока человека. */
export const personActionsRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
};

// Нижний отступ панели из макета. Держим числом: ниже он складывается с
// безопасной зоной, а не заменяется ею.
const BOTTOM_NAV_PADDING_PX = 18;

export const bottomStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(4, 1fr)',
  gap: 4,
  padding: '10px 12px',
  background: 'var(--card)',
  borderTop: '1px solid var(--line)',
  // Панель прибита к низу экрана, а не уезжает вверх вместе со списком
  // (отзыв владельца 2026-09-10). sticky, а не fixed: элемент остаётся в
  // потоке последним в колонке AppShell, поэтому под него не нужна распорка по
  // высоте — контент не залезает под панель на последнем экране списка.
  position: 'sticky',
  bottom: 0,
  // Выше карточек и листов расписания, ниже тоста обновления (zIndex 100).
  zIndex: 10,
  // Полоска «Домой» на iPhone лежала прямо на подписях (отзыв владельца
  // 2026-09-12, скриншот: «План» и «Каналы» перечёркнуты). Безопасная зона
  // СКЛАДЫВАЕТСЯ с отступом макета, а не заменяет его: env() отдаёт 0 там, где
  // зоны нет, и голый `paddingBottom: env(...)` обнулял бы в обычном браузере
  // те 18px, которые макет рисует под подписями.
  paddingBottom: `calc(${BOTTOM_NAV_PADDING_PX}px + env(safe-area-inset-bottom))`,
};

// Тон подложки активного пункта нижней панели — из макета (screens/
// 1c-planning.html, ADR-0043): светлее --panel (#f0ece3). Отдельного токена
// под один частный случай не заводим — достаточно именованной константы
// рядом с использованием (CLAUDE.md «Без магических чисел»).
const MOBILE_ACTIVE_BACKGROUND = '#f4efe6';

export const bottomLinkStyle = (isActive: boolean): CSSProperties => ({
  // `minWidth: 0` — как и во flex, grid-колонка по умолчанию не сжимается
  // уже содержимого: длинная неразрывная подпись раздвинула бы колонку и
  // потянула за собой горизонтальный скролл (тот же урок, что раньше был у
  // flex-раскладки, pr-k3-fixes.md п.10).
  minWidth: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  textAlign: 'center',
  padding: '8px 0',
  // Макет даёт тут ~34px (8×2 + кегль 12) — ниже цели нажатия 44px
  // (CLAUDE.md «Доступность»). Отклонение зафиксировано в ADR-0043
  // «Отклонения от макета».
  minHeight: 44,
  borderRadius: 'var(--radius-control)',
  textDecoration: 'none',
  fontSize: 12,
  overflowWrap: 'anywhere',
  color: isActive ? 'var(--ink)' : 'var(--ink-soft)',
  fontWeight: isActive ? 500 : 400,
  background: isActive ? MOBILE_ACTIVE_BACKGROUND : 'transparent',
});
