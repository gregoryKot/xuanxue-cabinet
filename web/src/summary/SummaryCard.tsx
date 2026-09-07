// Одна карточка сводки — число/дата и подпись, опционально ссылка на экран,
// где с этим можно что-то сделать (CLAUDE.md «Продуктовая фича = число в
// „Сводке“»). Не <button>: карточка — либо ссылка (Link), либо просто текст,
// действия внутри неё нет.
import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';

const cardStyle: CSSProperties = {
  display: 'block',
  padding: '14px 16px',
  borderRadius: 12,
  border: '1px solid var(--border)',
  background: '#fff',
  textDecoration: 'none',
  color: 'inherit',
};
const valueStyle: CSSProperties = { fontSize: 22, fontWeight: 700 };
const labelStyle: CSSProperties = {
  fontSize: 13,
  color: 'var(--ink-soft)',
  marginTop: 2,
};

interface SummaryCardProps {
  value: string;
  label: string;
  href?: string;
}

export function SummaryCard({ value, label, href }: SummaryCardProps) {
  const content = (
    <>
      <div style={valueStyle}>{value}</div>
      <div style={labelStyle}>{label}</div>
    </>
  );
  if (href) {
    return (
      <Link to={href} style={cardStyle}>
        {content}
      </Link>
    );
  }
  return <div style={cardStyle}>{content}</div>;
}
