// Облик значка уведомлений на мониторе (ADR-0063) — верх боковой колонки
// кабинета (AppNav.tsx), сразу под знаком школы: колокольчик, подпись и
// пилюля в одной строке, по геометрии как у пункта меню (sideLinkStyle,
// sideNavStyles.ts). Раньше ссылка стояла тусклой текстовой строкой внизу
// колонки, в блоке человека, — владелец её не нашёл (отзыв 2026-09-21):
// «у меня — учителя в кабинет нет колокольчика».
import type { CSSProperties } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { sideLinkStyle } from '../app/sideNavStyles';
import { BellIcon } from './BellIcon';
import { NotificationCount } from './NotificationCount';
import { badgeLabel, NOTIFICATIONS_LABEL } from './notificationBadge';
import { useNotifications } from './NotificationsProvider';

const NOTIFICATIONS_PATH = '/notifications';

const linkStyle = (isActive: boolean): CSSProperties => ({
  ...sideLinkStyle(isActive),
  gap: 8,
  // Ярче соседних пунктов (--ink-soft/400): владелец не нашёл ссылку на
  // прежнем месте, 2026-09-21. Раздел с новостями не тускнеет вместе с
  // остальными.
  color: 'var(--ink)',
  fontWeight: 500,
});

// Прижимает пилюлю к правому краю строки. Обёртка нужна и при нуле:
// `NotificationCount` тогда возвращает `null`, а пустой `<span>` ничего не
// ломает и не сдвигает соседние пункты меню.
const countSlotStyle: CSSProperties = { marginLeft: 'auto' };

export function NotificationsNavLink() {
  const { count } = useNotifications();
  const { pathname } = useLocation();
  // У центра уведомлений нет вложенных маршрутов (routeModules.ts) — точное
  // сравнение путей достаточно; activeSectionPath (navItems.ts) тут лишний,
  // та функция ищет пункт по списку с childPaths, а здесь пункт один.
  const isActive = pathname === NOTIFICATIONS_PATH;
  return (
    <Link
      to={NOTIFICATIONS_PATH}
      aria-label={badgeLabel(count)}
      aria-current={isActive ? 'page' : undefined}
      style={linkStyle(isActive)}
    >
      <BellIcon />
      {NOTIFICATIONS_LABEL}
      <span style={countSlotStyle}>
        <NotificationCount count={count} />
      </span>
    </Link>
  );
}
