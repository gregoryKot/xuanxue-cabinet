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

export function PlanningIcon() {
  return (
    <svg {...shared}>
      <rect x="3" y="4" width="14" height="13" rx="2" />
      <path d="M3 8h14M7 12.5l1.8 1.8L13 10.5" />
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

export function ExamsIcon() {
  return (
    <svg {...shared}>
      <path d="M4 4h9l3 3v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z" />
      <path d="M13 4v3h3M7 11h6M7 14h4" />
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
