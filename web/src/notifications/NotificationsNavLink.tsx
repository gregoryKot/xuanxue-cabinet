// Облик значка уведомлений для монитора (ADR-0065) — текстовая ссылка в
// блоке человека боковой колонки (AppNav.tsx), рядом с «Профиль»: тот же
// textLinkStyle (screenLayout.ts), которым в AppShell.tsx нарисована ссылка
// «Профиль», — оба читаются одним приёмом, не двумя разными.
import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { textLinkStyle } from '../components/screenLayout';
import { NotificationCount } from './NotificationCount';
import { badgeLabel, NOTIFICATIONS_LABEL } from './notificationBadge';
import { useNotifications } from './NotificationsProvider';

const NOTIFICATIONS_PATH = '/notifications';

// `alignSelf: 'flex-start'` обязателен: personBlockStyle (sideNavStyles.ts)
// — flex-колонка, без него ссылка растянется во всю ширину колонки и
// подчёркивание textLinkStyle уедет за текст.
const linkStyle: CSSProperties = {
  ...textLinkStyle,
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  minHeight: 44,
  alignSelf: 'flex-start',
};

export function NotificationsNavLink() {
  const { count } = useNotifications();
  return (
    <Link to={NOTIFICATIONS_PATH} aria-label={badgeLabel(count)} style={linkStyle}>
      {NOTIFICATIONS_LABEL}
      <NotificationCount count={count} />
    </Link>
  );
}
