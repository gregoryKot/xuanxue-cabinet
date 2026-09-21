// Значки нижней панели телефона (ADR-0097) — подпись раздела ушла в
// `aria-label` ссылки, значок вместо неё decorative-only. Тот же приём, что
// ProfileIcon.tsx и BellIcon.tsx: свой inline-SVG без иконной библиотеки
// (CLAUDE.md «Зависимости»). Один компонент на все имена, не файл на значок —
// `SHAPES` типа `Record<NavIconName, ReactNode>` не даёт `tsc` пропустить
// новое имя без рисунка.
import type { CSSProperties, ReactNode } from 'react';
import type { NavIconName } from './navItems';

// В панели значок крупнее, чем 20px у ProfileIcon/BellIcon в верхней строке:
// там он стоит рядом с текстом, здесь — вместо текста, и мельче читается хуже.
const ICON_SIZE_PX = 22;
const STROKE_WIDTH = 1.5;

const iconStyle: CSSProperties = { display: 'block', flexShrink: 0 };

const SHAPES: Record<NavIconName, ReactNode> = {
  // Календарь — «Занятия».
  lessons: (
    <>
      <rect x="3" y="4.5" width="14" height="12.5" rx="2" />
      <path d="M3 8.5h14M7 2.5v3M13 2.5v3" />
    </>
  ),
  // Бумажный самолётик — «Рассылки».
  broadcasts: (
    <>
      <path d="M17.5 2.5 2.5 8l6.5 2.8L11.8 17.5z" />
      <path d="M17.5 2.5 9 10.8" />
    </>
  ),
  // Планшет с листом — «Экзамены».
  exams: (
    <>
      <rect x="4.5" y="3.5" width="11" height="13" rx="2" />
      <path d="M7.5 3.5V3a1.5 1.5 0 0 1 1.5-1.5h2A1.5 1.5 0 0 1 12.5 3v.5" />
      <path d="M7.5 9.5h5M7.5 12.5h3" />
    </>
  ),
  // Двое — «Ученики».
  people: (
    <>
      <circle cx="7.75" cy="7" r="2.75" />
      <path d="M2.5 16.5c.6-2.9 2.7-4.6 5.25-4.6s4.65 1.7 5.25 4.6" />
      <path d="M13.5 5.4a2.6 2.6 0 0 1 0 5.2" />
    </>
  ),
  // Раскрытая книга — «Материалы».
  materials: (
    <>
      <path d="M10 6.5A3 3 0 0 0 7 4H3v10h4.5A2.5 2.5 0 0 1 10 16.5z" />
      <path d="M10 6.5A3 3 0 0 1 13 4h4v10h-4.5A2.5 2.5 0 0 0 10 16.5z" />
    </>
  ),
  // Список с галочкой — «Задания».
  tasks: (
    <>
      <path d="M3 5.5 4.5 7 7 4" />
      <path d="M3 13.5 4.5 15 7 12" />
      <path d="M9.5 5.5h7.5M9.5 13.5h7.5" />
    </>
  ),
};

/** Декоративный: соседняя ссылка называет раздел словами (`aria-label`). */
export function NavIcon({ name }: { name: NavIconName }) {
  return (
    <svg
      width={ICON_SIZE_PX}
      height={ICON_SIZE_PX}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={STROKE_WIDTH}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={iconStyle}
    >
      {SHAPES[name]}
    </svg>
  );
}
