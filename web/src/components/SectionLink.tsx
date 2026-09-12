// Карточка-ссылка «куда ещё зайти из раздела» (docs/adr/0025-navigation-by-
// domain.md): вход в подэкран (расписание, каналы, шаблоны, вопросы) живёт
// внутри своего раздела картой, не отдельным пунктом меню. Перенесено из
// settings/SettingsScreen.tsx (там называлась SettingsCard) — та же карточка
// нужна на «Занятиях», «Рассылках» и «Экзаменах» (CLAUDE.md «Одна механика —
// один компонент»).
import type { ComponentType, CSSProperties } from 'react';
import { Link } from 'react-router-dom';

const cardStyle: CSSProperties = {
  display: 'flex',
  // Иконка ровняется по первой строке, а не по середине карточки: подсказка
  // бывает в две строки, и по центру иконка повисает напротив пустоты.
  alignItems: 'flex-start',
  gap: 12,
  padding: 16,
  minHeight: 44,
  borderRadius: 12,
  border: '1px solid var(--border)',
  background: '#fff',
  color: 'var(--ink)',
  textDecoration: 'none',
};
const iconStyle: CSSProperties = {
  display: 'flex',
  marginTop: 2,
  color: 'var(--ink-soft)',
};
const titleStyle: CSSProperties = { display: 'block', fontWeight: 600 };
// span, не p: абзацу не место внутри строчного содержимого ссылки, браузер
// такую вложенность разбирает по-своему.
const hintStyle: CSSProperties = {
  display: 'block',
  margin: 0,
  color: 'var(--ink-soft)',
  fontSize: 14,
};

export interface SectionLinkProps {
  to: string;
  title: string;
  hint: string;
  Icon: ComponentType;
}

export function SectionLink({ to, title, hint, Icon }: SectionLinkProps) {
  return (
    <Link to={to} style={cardStyle}>
      <span style={iconStyle}>
        <Icon />
      </span>
      <span>
        <span style={titleStyle}>{title}</span>
        <span style={hintStyle}>{hint}</span>
      </span>
    </Link>
  );
}
