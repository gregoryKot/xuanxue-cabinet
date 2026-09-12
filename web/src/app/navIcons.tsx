// Иконки нижней навигации — простые линии 20×20, `currentColor` берёт цвет
// активной/неактивной ссылки сам (CLAUDE.md «Мобильный экран первым»: с
// иконкой подпись остаётся короче на 360px, когда пунктов больше 5 —
// ревью пункт 10 pr-k3-fixes.md, PLAN §6).
// `aria-hidden` — подпись рядом уже называет раздел, дублировать нечем.
import type { SVGProps } from 'react';

const shared: SVGProps<SVGSVGElement> = {
  width: 20,
  height: 20,
  viewBox: '0 0 20 20',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  focusable: false,
};

export function SummaryIcon() {
  return (
    <svg {...shared}>
      <path d="M4 16V9M10 16V4M16 16v-6" />
    </svg>
  );
}

export function ScheduleIcon() {
  return (
    <svg {...shared}>
      <rect x="3" y="4" width="14" height="13" rx="2" />
      <path d="M3 8h14M7 2v4M13 2v4" />
    </svg>
  );
}

export function PlanningIcon() {
  return (
    <svg {...shared}>
      <rect x="3" y="4" width="14" height="13" rx="2" />
      <path d="M3 8h14M7 12.5l1.8 1.8L13 10.5" />
    </svg>
  );
}

export function ChannelsIcon() {
  return (
    <svg {...shared}>
      <path d="M3 8v4l3 1 9 3V4L6 7z" />
      <path d="M6 13v3a2 2 0 0 0 2 2h1" />
    </svg>
  );
}

export function BroadcastsIcon() {
  return (
    <svg {...shared}>
      <path d="M17 3 3 9.5l6 2 2 6z" />
      <path d="M17 3 9.5 11.5" />
    </svg>
  );
}

export function TemplatesIcon() {
  return (
    <svg {...shared}>
      <rect x="4" y="2" width="12" height="16" rx="1.5" />
      <path d="M7 6h6M7 9.5h6M7 13h4" />
    </svg>
  );
}

export function SettingsIcon() {
  return (
    <svg {...shared}>
      <circle cx="10" cy="10" r="2.5" />
      <path d="M10 2.5v2M10 15.5v2M17.5 10h-2M4.5 10h-2M15.3 4.7l-1.4 1.4M6.1 13.9l-1.4 1.4M15.3 15.3l-1.4-1.4M6.1 6.1L4.7 4.7" />
    </svg>
  );
}

export function PeopleIcon() {
  return (
    <svg {...shared}>
      <circle cx="8" cy="7" r="3" />
      <path d="M2.5 17c0-3 2.5-5 5.5-5s5.5 2 5.5 5M14 4.2a3 3 0 0 1 0 5.6M15.5 12.4c1.4.7 2.3 2 2.3 3.6" />
    </svg>
  );
}
