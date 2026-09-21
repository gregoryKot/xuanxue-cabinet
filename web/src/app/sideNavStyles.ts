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
 * Справа отступа нет: за названием в этой строке ничего не стоит, а десять
 * пикселей там стоили переноса — см. расчёт у sideBrandTitleStyle ниже. */
export const sideBrandRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '0 0 10px 10px',
};

/** «Школа Сюань-Сюэ» переносилось на две строки (снимок владельца
 * 2026-09-19). Ширина колонки 236 расходуется так: 32 на паддинг колонки
 * (16+16), 10 на левый паддинг этой строки, 26 на знак школы и 10 на зазор —
 * под текст оставалось 148. Замер в Chromium на самом Cormorant Garamond 500:
 * строка просит 163px при кегле 20 и 147px при 18. Отсюда две правки: убран
 * правый паддинг строки (стало 158 доступных) и кегль 20 → 18.
 *
 * `nowrap` закрепляет результат, а `ellipsis` страхует от единственного
 * случая, когда расчёт не сходится: `font-display: swap` рисует строку
 * подстановочной антиквой, пока грузится своя, и та бывает шире. Тогда
 * название подрежется многоточием внутри колонки, а не вылезет за неё (тот
 * же приём, что у адреса ссылки-приглашения, people/InviteLinkCard.tsx).
 *
 * `lineHeight` явный: от body наследовался 1.6, и перенесённая вторая строка
 * отъезжала заметно ниже, чем нужно заголовку. */
export const sideBrandTitleStyle: CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: 18,
  lineHeight: 1.2,
  color: 'var(--ink)',
  minWidth: 0,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
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
export const personActionsRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
};
