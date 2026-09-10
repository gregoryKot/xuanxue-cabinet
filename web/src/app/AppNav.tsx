// Навигация кабинета в двух видах: на телефоне — нижняя панель вкладок, на
// широком экране — колонка слева (отзыв владельца 2026-09-09: «дизайна так и
// нет для десктопа»). Раньше нижняя панель растягивалась во всю ширину
// монитора — телефонный приём на экране, где он читается как обрезок.
// Вынесено из AppShell.tsx: там иначе два набора стилей и ветка на файл в
// 150 строк (CLAUDE.md «Храповики», «Логика вне компонентов»).
import type { CSSProperties } from 'react';
import { NavLink } from 'react-router-dom';
import { NAV_ITEMS } from './navItems';

export const SIDE_NAV_WIDTH_PX = 208;

const bottomStyle: CSSProperties = {
  display: 'flex',
  borderTop: '1px solid var(--border)',
  background: '#fff',
  // Панель прибита к низу экрана, а не уезжает вверх вместе со списком
  // (отзыв владельца 2026-09-10). sticky, а не fixed: элемент остаётся в
  // потоке последним в колонке AppShell, поэтому под него не нужна распорка по
  // высоте — контент не залезает под панель на последнем экране списка.
  position: 'sticky',
  bottom: 0,
  // Выше карточек и листов расписания, ниже тоста обновления (zIndex 100).
  zIndex: 10,
};
const sideStyle: CSSProperties = {
  width: SIDE_NAV_WIDTH_PX,
  flexShrink: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  padding: 12,
  borderRight: '1px solid var(--border)',
  background: '#fff',
};

const bottomLinkStyle = (isActive: boolean): CSSProperties => ({
  flex: 1,
  // `minWidth: 0` — иначе flex-item не сжимается уже своего содержимого, и
  // 6 пунктов на 360px толкают body в горизонтальный скролл (pr-k3-fixes.md
  // п.10): вместе с overflowWrap подписи ниже это держит навигацию в ширине
  // экрана без теста на ширину — проверка стилями, не пикселями.
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 2,
  padding: '8px 2px',
  minHeight: 44,
  textDecoration: 'none',
  color: isActive ? 'var(--accent)' : 'var(--ink-soft)',
  fontWeight: isActive ? 600 : 400,
});

const sideLinkStyle = (isActive: boolean): CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '10px 12px',
  minHeight: 44,
  borderRadius: 8,
  textDecoration: 'none',
  color: isActive ? 'var(--accent)' : 'var(--ink)',
  fontWeight: isActive ? 600 : 400,
  background: isActive ? 'var(--surface-2)' : 'transparent',
});

const bottomLabelStyle: CSSProperties = {
  fontSize: 11,
  lineHeight: 1.1,
  textAlign: 'center',
  overflowWrap: 'anywhere',
};

interface AppNavProps {
  isMobile: boolean;
}

export function AppNav({ isMobile }: AppNavProps) {
  const linkStyle = isMobile ? bottomLinkStyle : sideLinkStyle;

  return (
    <nav style={isMobile ? bottomStyle : sideStyle} aria-label="Разделы кабинета">
      {NAV_ITEMS.map(({ to, label, Icon }) => (
        <NavLink key={to} to={to} style={({ isActive }) => linkStyle(isActive)}>
          <Icon />
          {isMobile ? (
            <span style={bottomLabelStyle}>{label}</span>
          ) : (
            <span>{label}</span>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
