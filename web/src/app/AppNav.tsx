// Навигация кабинета в двух видах: на телефоне — нижняя панель вкладок, на
// широком экране — колонка слева (отзыв владельца 2026-09-09: «дизайна так и
// нет для десктопа»). Раньше нижняя панель растягивалась во всю ширину
// монитора — телефонный приём на экране, где он читается как обрезок.
// Вынесено из AppShell.tsx: там иначе два набора стилей и ветка на файл в
// 150 строк (CLAUDE.md «Храповики», «Логика вне компонентов»).
import { Link, useLocation } from 'react-router-dom';
import type { MeDto } from '@xuanxue/shared';
import { hasRole } from '../auth/hasRole';
import {
  bottomLabelStyle,
  bottomLinkStyle,
  bottomStyle,
  navDotStyle,
  SIDE_NAV_WIDTH_PX,
  sideLinkStyle,
  sideStyle,
} from './navLinkStyles';
import { activeSectionPath, NAV_ITEMS } from './navItems';

export { SIDE_NAV_WIDTH_PX };

interface AppNavProps {
  isMobile: boolean;
  me: MeDto | null;
}

export function AppNav({ isMobile, me }: AppNavProps) {
  const { pathname } = useLocation();
  const active = activeSectionPath(pathname);
  const items = NAV_ITEMS.filter(
    (item) => !item.roles || item.roles.some((role) => hasRole(me, role)),
  );
  const linkStyle = isMobile ? bottomLinkStyle : sideLinkStyle;

  return (
    <nav style={isMobile ? bottomStyle : sideStyle} aria-label="Разделы кабинета">
      {items.map(({ to, label, Icon }) => {
        const isActive = active === to;
        return (
          <Link
            key={to}
            to={to}
            aria-current={isActive ? 'page' : undefined}
            style={linkStyle(isActive)}
          >
            {/* Единственный акцент пункта — точка «вы здесь» (CLAUDE.md
                «Правило акцента»), не заливка всей строки. */}
            {isActive && (
              <span className="xuanxue-nav-dot" style={navDotStyle} aria-hidden="true" />
            )}
            <Icon />
            {isMobile ? (
              <span style={bottomLabelStyle}>{label}</span>
            ) : (
              <span>{label}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
