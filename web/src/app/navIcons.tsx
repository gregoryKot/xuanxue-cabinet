// Иконки нижней навигации — простые линии 20×20, `currentColor` берёт цвет
// активной/неактивной ссылки сам (CLAUDE.md «Мобильный экран первым»: с
// иконкой подпись остаётся короче на 360px, когда пунктов больше 5, ревью п.11).
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
