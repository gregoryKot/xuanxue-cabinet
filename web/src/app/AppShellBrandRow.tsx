// Верхняя строка содержимого без боковой колонки (AppShell.tsx: на телефоне
// и у ученика на мониторе) — знак школы и название. Вынесена отдельным
// компонентом, чтобы AppShell.tsx не перерос 150 строк (CLAUDE.md
// «Храповики»).
//
// На телефоне имя человека — ссылка на «Уведомления» (личная настройка,
// notifications-web.md): владелец счёл подвал «Вы вошли как …» на каждом
// экране лишним (он и был заведён ради этого — отзыв 2026-09-12, шапка
// AppShell.tsx), а знак с названием на телефоне и так стоят первой строкой.
// «Выйти» с телефона переехала на сам экран «Уведомления»
// (NotificationsScreen.tsx) — она нужна редко, не на каждом экране. На
// мониторе у ученика (боковой колонки не бывает) подвал под содержимым
// остаётся как был — там и живут «Уведомления»/«Выйти» (AppShell.tsx).
import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { SchoolMark, SCHOOL_NAME } from '../components/SchoolMark';
import { textLinkStyle } from '../components/screenLayout';

const NOTIFICATIONS_PATH = '/notifications';
// Подпись честная про отсутствие имени — как везде в кабинете (PeopleScreen,
// PersonRow.tsx), не пустая строка.
const NO_NAME_LABEL = '—';

const rowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  padding: '12px 16px',
};
const titleStyle: CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontWeight: 500,
  fontSize: 21,
  color: 'var(--ink)',
};
const personLinkStyle: CSSProperties = { ...textLinkStyle, marginLeft: 'auto' };

interface AppShellBrandRowProps {
  isMobile: boolean;
  name?: string;
}

export function AppShellBrandRow({ isMobile, name }: AppShellBrandRowProps) {
  return (
    <span style={rowStyle}>
      <SchoolMark />
      <span style={titleStyle}>{SCHOOL_NAME}</span>
      {isMobile && (
        <Link to={NOTIFICATIONS_PATH} style={personLinkStyle} aria-label="Уведомления">
          {name ?? NO_NAME_LABEL}
        </Link>
      )}
    </span>
  );
}
