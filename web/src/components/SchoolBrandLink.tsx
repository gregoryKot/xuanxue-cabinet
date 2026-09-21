// Знак школы вместе с названием — ссылка на главную страницу кабинета.
// Привычка любого сайта: логотип ведёт домой, человек жмёт знак, чтобы
// вернуться туда, откуда начал. Куда именно вести, решает вызывающий — у
// штата и у ученика разные корни (screenAccess.ts `rootPathFor`), сама
// ссылка про роли не знает (CLAUDE.md «Логика вне компонентов»).
import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { SchoolWordmark } from './SchoolWordmark';

const linkStyle: CSSProperties = {
  // Раскладку знака и названия (строка, зазор) несёт сама SchoolWordmark —
  // здесь остаётся только то, что нужно самой цели нажатия. `display:flex`
  // не дублирует её: `min-height` не действует на строчный (inline) элемент,
  // которым иначе была бы ссылка, так что это условие, чтобы `minHeight`
  // ниже вообще что-то делал, плюс центрирует единственного ребёнка по
  // высоте цели нажатия.
  display: 'flex',
  alignItems: 'center',
  textDecoration: 'none',
  color: 'inherit',
  minWidth: 0,
  // Цель нажатия ≥44×44 (CLAUDE.md «Доступность») — знак сам по себе всего
  // 26px, ссылка расширяет область нажатия вокруг него и названия.
  minHeight: 44,
};

interface SchoolBrandLinkProps {
  to: string;
}

/** Доступное имя ссылки даёт видимый текст «Школа Сюань-Сюэ» — знак рядом
 * декоративный (alt="", SchoolMark.tsx), aria-label дублировал бы то, что
 * скринридер и так прочитает. */
export function SchoolBrandLink({ to }: SchoolBrandLinkProps) {
  return (
    <Link to={to} style={linkStyle}>
      <SchoolWordmark />
    </Link>
  );
}
