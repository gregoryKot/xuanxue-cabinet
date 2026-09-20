// Значок колокольчика (ADR-0063) — тот же приём, что ProfileIcon.tsx: чистый
// контур без сторонних иконных библиотек (CLAUDE.md «Зависимости»),
// decorative-only. Соседняя ссылка называет место словами (`aria-label` —
// badgeLabel(), notificationBadge.ts), скринридеру самому значку дублировать
// нечем.
import type { CSSProperties } from 'react';

const ICON_SIZE_PX = 20;
const STROKE_WIDTH = 1.5;

const iconStyle: CSSProperties = { display: 'block', flexShrink: 0 };

/** Декоративный: соседняя ссылка называет место словами (`aria-label`). */
export function BellIcon() {
  return (
    <svg
      width={ICON_SIZE_PX}
      height={ICON_SIZE_PX}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={STROKE_WIDTH}
      strokeLinecap="round"
      aria-hidden="true"
      style={iconStyle}
    >
      <path d="M10 1.6v1.4" />
      <path d="M10 3C7.24 3 5 5.24 5 8L5 10.5C5 12 3.5 13.5 3.5 14.5L16.5 14.5C16.5 13.5 15 12 15 10.5L15 8C15 5.24 12.76 3 10 3Z" />
      <path d="M8.3 15.3a1.7 1.7 0 0 0 3.4 0" />
    </svg>
  );
}
