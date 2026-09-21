// Знак школы вместе с названием — ссылка на главную страницу кабинета.
// Привычка любого сайта: логотип ведёт домой, человек жмёт знак, чтобы
// вернуться туда, откуда начал. Куда именно вести, решает вызывающий — у
// штата и у ученика разные корни (screenAccess.ts `rootPathFor`), сама
// ссылка про роли не знает (CLAUDE.md «Логика вне компонентов»).
import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { SchoolMark, SCHOOL_NAME } from './SchoolMark';

const linkStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  // Тот же зазор, что был между знаком и названием в местах, где эта пара
  // раньше рисовалась напрямую (sideBrandRowStyle в sideNavStyles.ts,
  // rowStyle в AppShellBrandRow.tsx) — переезд в ссылку не должен сдвинуть
  // уже привычную раскладку.
  gap: 10,
  textDecoration: 'none',
  color: 'inherit',
  minWidth: 0,
  // Цель нажатия ≥44×44 (CLAUDE.md «Доступность») — знак сам по себе всего
  // 26px, ссылка расширяет область нажатия вокруг него и названия.
  minHeight: 44,
};

interface SchoolBrandLinkProps {
  to: string;
  titleStyle: CSSProperties;
}

/** Доступное имя ссылки даёт видимый текст «Школа Сюань-Сюэ» — знак рядом
 * декоративный (alt="", SchoolMark.tsx), aria-label дублировал бы то, что
 * скринридер и так прочитает. */
export function SchoolBrandLink({ to, titleStyle }: SchoolBrandLinkProps) {
  return (
    <Link to={to} style={linkStyle}>
      <SchoolMark />
      <span style={titleStyle}>{SCHOOL_NAME}</span>
    </Link>
  );
}
