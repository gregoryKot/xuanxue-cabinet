// Навигация кабинета в двух видах: на телефоне — нижняя панель вкладок, на
// широком экране — колонка слева (отзыв владельца 2026-09-09: «дизайна так и
// нет для десктопа»). Колонка слева несёт ещё знак школы сверху и блок
// человека снизу (ADR-0043): «Профиль» (ADR-0045) и «Выйти» приходят
// готовыми узлами через пропсы — сама навигация про авторизацию не знает
// (CLAUDE.md «Логика вне компонентов»). На телефоне блок человека рисует
// AppShell.tsx под содержимым, эта колонка там — только пункты меню.
// Вынесено из AppShell.tsx: там иначе два набора стилей и ветка на файл в
// 150 строк (CLAUDE.md «Храповики», «Логика вне компонентов»).
import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import type { MeDto } from '@xuanxue/shared';
import { hasRole } from '../auth/hasRole';
import { SchoolBrandLink } from '../components/SchoolBrandLink';
import { NavIcon } from './NavIcon';
import { bottomLinkStyle, bottomPillStyle, bottomStyle } from './bottomNavStyles';
import {
  personActionsRowStyle,
  personBlockStyle,
  sideBrandRowStyle,
  SIDE_NAV_WIDTH_PX,
  sideLinkStyle,
  sideSectionsStyle,
  sideStyle,
} from './sideNavStyles';
import { activeSectionPath, navItemsFor } from './navItems';
import { rootPathFor } from './screenAccess';

export { SIDE_NAV_WIDTH_PX };

// Имя ориентира одно на оба вида навигации (CLAUDE.md «Повторяющийся текст
// пользователю — тоже константа»): колонка и нижняя панель — одна механика,
// скринридер должен слышать одно имя независимо от ширины экрана.
const SECTIONS_LABEL = 'Разделы кабинета';

interface AppNavProps {
  isMobile: boolean;
  me: MeDto | null;
  /** Блок человека рисуется только в боковой колонке (`!isMobile`) — на
   * телефоне его держит подвал AppShell.tsx, поэтому мобильный вызов может
   * их не передавать вовсе. */
  profileLink?: ReactNode;
  /** Ссылка на «Уведомления» (ADR-0063) — верх колонки, перед списком
   * разделов (JSX ниже). Навигация про уведомления не знает, узел приходит
   * готовым, как profileLink/logoutButton (CLAUDE.md «Логика вне
   * компонентов»). */
  notificationsLink?: ReactNode;
  logoutButton?: ReactNode;
}

export function AppNav({
  isMobile,
  me,
  profileLink,
  notificationsLink,
  logoutButton,
}: AppNavProps) {
  const { pathname } = useLocation();
  const items = navItemsFor(me).filter(
    (item) => !item.roles || item.roles.some((role) => hasRole(me, role)),
  );
  const active = activeSectionPath(pathname, items);

  // Нижняя панель — своя разметка: цель нажатия (`<Link>`, 44px, без вида) и
  // видимая плашка вокруг значка (`<span>`, размер макета) — разные элементы,
  // не один стиль на двоих (bottomNavStyles.ts: bottomLinkStyle/bottomPillStyle).
  // Подписи в панели нет (ADR-0097): имя раздела читает `aria-label` ссылки,
  // значок внутри плашки — decorative-only (`aria-hidden`, NavIcon.tsx).
  if (isMobile) {
    return (
      <nav style={bottomStyle(items.length)} aria-label={SECTIONS_LABEL}>
        {items.map(({ to, label, icon }) => {
          const isActive = active === to;
          return (
            <Link
              key={to}
              to={to}
              aria-label={label}
              aria-current={isActive ? 'page' : undefined}
              style={bottomLinkStyle}
            >
              <span style={bottomPillStyle(isActive)}>
                <NavIcon name={icon} />
              </span>
            </Link>
          );
        })}
      </nav>
    );
  }

  const links = items.map(({ to, label }) => {
    const isActive = active === to;
    return (
      <Link
        key={to}
        to={to}
        aria-current={isActive ? 'page' : undefined}
        style={sideLinkStyle(isActive)}
      >
        {label}
      </Link>
    );
  });

  // Ориентир «Разделы кабинета» обязан содержать только разделы: знак школы и
  // блок человека лежат в колонке рядом с `<nav>`, а не внутри него. В макете
  // всё это один столбец, и соблазн обернуть столбец в `<nav>` целиком велик —
  // но тогда скринридер, переходящий по ориентирам, найдёт под этим именем ещё
  // и «Выйти» (CLAUDE.md «Доступность»). `margin-top: auto` у блока человека
  // по-прежнему работает: он прямой ребёнок этой же flex-колонки.
  return (
    <div style={sideStyle}>
      {/* Знак и название — ссылка на корень роли (SchoolBrandLink.tsx):
          логотип ведёт домой, а домой у штата и у ученика по-разному
          (rootPathFor, screenAccess.ts). */}
      <span style={sideBrandRowStyle}>
        <SchoolBrandLink to={rootPathFor(me)} />
      </span>
      {/* Наверху колонки, не внизу у «Профиль · Выйти»: владелец не нашёл
          тусклую текстовую ссылку в блоке человека (отзыв 2026-09-21) —
          колокольчик (NotificationsNavLink.tsx) теперь первым пунктом видимой
          строки. Снаружи `<nav>` по той же причине, что знак школы и блок
          человека ниже, — см. комментарий у самого `<nav>`. */}
      {notificationsLink}
      <nav style={sideSectionsStyle} aria-label={SECTIONS_LABEL}>
        {links}
      </nav>
      <div style={personBlockStyle}>
        <span>Вы вошли как {me?.name ?? '—'}</span>
        <span style={personActionsRowStyle}>
          {profileLink}
          <span>·</span>
          {logoutButton}
        </span>
      </div>
    </div>
  );
}
