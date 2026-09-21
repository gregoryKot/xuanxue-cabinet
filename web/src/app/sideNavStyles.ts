// Стили боковой колонки кабинета — вид навигации на широком экране
// (AppNav.tsx). Нижняя панель вкладок живёт отдельно (bottomNavStyles.ts).
// Вынесено из AppNav.tsx (CLAUDE.md «Храповики»: компонент
// за 150 строк — выноси хуки и подкомпоненты). Направление «Тёплая школа»
// (docs/adr/0043-visual-direction-warm-school.md, заменил ADR-0031) сняло
// заливку строки и киноварную точку «вы здесь»: у активного пункта теперь
// белая плашка с мягкой тенью. У самой колонки больше нет `border-right` —
// на мониторе владельца эта линейка тянулась вдоль 900px пустоты под
// четырьмя пунктами (ADR-0043 «Контекст»); границу заменяет контраст плашки
// активного пункта с прозрачным фоном вокруг.
import type { CSSProperties } from 'react';

// 236, не 208: колонка выросла вместе с макетом (ADR-0043) — на 208px блок
// человека переносил «Профиль · Выйти» на две строки.
export const SIDE_NAV_WIDTH_PX = 236;

export const sideStyle: CSSProperties = {
  width: SIDE_NAV_WIDTH_PX,
  flexShrink: 0,
  padding: '22px 16px',
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
  // Оболочка теперь ровно в высоту экрана (AppShell.tsx), и на низком окне
  // колонка упёрлась бы в её низ: блок человека с «Профиль · Выйти» стал бы
  // недостижим — страница-то больше не прокручивается. Свой скролл — у самой
  // колонки.
  overflowY: 'auto',
};

/** Сами пункты внутри колонки — отдельный `<nav>`, чтобы ориентир «Разделы
 * кабинета» не захватывал знак школы и блок человека (AppNav.tsx). Тот же
 * `gap`, что у колонки: визуально столбец остаётся единым, как в макете. */
export const sideSectionsStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 6,
};

/** Знак школы и название — первая строка боковой колонки (AppNav.tsx),
 * теперь ссылка на корень роли (SchoolBrandLink.tsx).
 *
 * Высота строки раньше (padding `6px 0 22px 10px`) складывалась из
 * содержимого высотой 26px (знак — самый высокий из двух соседей, текст
 * ниже) плюс отступов 6 сверху и 22 снизу — итого 54px. Ссылка добавила цель
 * нажатия 44px (CLAUDE.md «Доступность», SchoolBrandLink.tsx `minHeight`) —
 * она выше знака и текста и теперь сама определяет высоту содержимого.
 * Чтобы блок остался той же высоты 54px и пункты меню под ним не съехали
 * (`gap` колонки, sideStyle, отсчитывается от нижнего края этого блока),
 * отступы уменьшены пропорционально: верхний обнулён, нижний упал с 22 до
 * 10 — 44 + 10 = 54. Левый отступ (10) не связан с высотой и не менялся.
 *
 * Справа отступа нет: за названием в этой строке ничего не стоит, а лишний
 * отступ только уменьшил бы доступную под текст ширину (начертание и расчёт
 * ширины — components/SchoolMark.tsx, SchoolWordmark). */
export const sideBrandRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '0 0 10px 10px',
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
 * туда при любом числе пунктов выше. Ссылка «Профиль» и кнопка «Выйти»
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

/** Строка «Профиль · Выйти» внутри блока человека. */
/** Ссылка внутри блока человека — «Профиль». Без линии снизу: линия в
 * кабинете помечает текстовую ссылку в потоке содержимого, а оболочка
 * состоит из одних ссылок, и отличать их друг от друга ей нечем
 * (docs/adr/0098). От неинтерактивной строки рядом («Вы вошли как …»,
 * приглушённой `personBlockStyle`) ссылка отличается тушью — тем же
 * приёмом, что «Уведомления» наверху колонки
 * (notifications/NotificationsNavLink.tsx). Кегль наследуется от блока (13),
 * свой не нужен. `minHeight` свой: строка выравнивает детей по центру
 * (`personActionsRowStyle`, `align-items: center`), а не растягивает, поэтому
 * 44px соседней кнопки «Выйти» на ссылку не переходят — без этого цель
 * нажатия была бы ниже 44 (CLAUDE.md «Доступность»). Высоту строки это не
 * меняет: кнопка рядом и так 44. */
export const personLinkStyle: CSSProperties = {
  color: 'var(--ink)',
  textDecoration: 'none',
  display: 'inline-flex',
  alignItems: 'center',
  minHeight: 44,
};

export const personActionsRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
};
