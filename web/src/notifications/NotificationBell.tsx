// Телефонный облик значка уведомлений (ADR-0063) — ссылка-значок в верхней
// строке кабинета (AppShellBrandRow.tsx), слева от значка профиля. Тот же
// приём, что ProfileIcon.tsx: колокольчик декоративный, место называет
// aria-label самой ссылки — badgeLabel() уже склоняет число словами, читать
// саму пилюлю скринридеру нечем (NotificationCount.tsx).
import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { BellIcon } from './BellIcon';
import { NotificationCount } from './NotificationCount';
import { badgeLabel } from './notificationBadge';
import { useNotifications } from './NotificationsProvider';

const NOTIFICATIONS_PATH = '/notifications';

// Цель нажатия 44×44 (CLAUDE.md «Доступность») — тот же приём, что
// PROFILE_LINK_SIZE_PX в AppShellBrandRow.tsx: значок внутри заметно меньше
// (20×20, BellIcon.tsx), лишнее поле вокруг него не видно, это область
// нажатия, не рамка.
const BELL_LINK_SIZE_PX = 44;

// Не textLinkStyle (screenLayout.ts): подчёркивание — приём текстовой
// ссылки, а тут значок без подписи рядом (тот же довод, что у
// profileLinkStyle в AppShellBrandRow.tsx).
const linkStyle: CSSProperties = {
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: BELL_LINK_SIZE_PX,
  minHeight: BELL_LINK_SIZE_PX,
  color: 'var(--ink-soft)',
  textDecoration: 'none',
};

// Пилюля висит у правого верхнего угла значка и не раздвигает цель нажатия:
// `position: absolute` внутри линка (position: relative у linkStyle),
// `pointerEvents: none` — нажатие всегда достаётся ссылке под пилюлей.
const countSlotStyle: CSSProperties = {
  position: 'absolute',
  top: 6,
  right: 4,
  pointerEvents: 'none',
};

export function NotificationBell() {
  const { count } = useNotifications();
  return (
    <Link to={NOTIFICATIONS_PATH} aria-label={badgeLabel(count)} style={linkStyle}>
      <BellIcon />
      <span style={countSlotStyle}>
        <NotificationCount count={count} />
      </span>
    </Link>
  );
}
