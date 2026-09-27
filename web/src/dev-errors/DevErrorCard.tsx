// Одна карточка журнала сбоев (DevErrorsScreen.tsx) — не клик, только чтение:
// текст ошибки, код обращения и время нужны, чтобы найти строку в логах
// Railway или узнать её по алёрту в Telegram, переход со строки никуда не
// ведёт.
import type { CSSProperties } from 'react';
import type { AppErrorDto } from '@xuanxue/shared';
import { listCardMetaStyle, listCardStyle } from '../components/listCardStyles';
import { formatDateTime } from '../lib/formatDate';
import { formatKindLabel, formatSourceLabel } from './devErrorsFormat';

// `listCardStyle` рассчитан на `<button>` (курсор-указатель, сброс рамки) —
// здесь строка не кликабельна, курсор возвращаем обычным.
const rowStyle: CSSProperties = { ...listCardStyle, cursor: 'default' };
const metaLineStyle: CSSProperties = { ...listCardMetaStyle, marginTop: 0 };
const pathLineStyle: CSSProperties = { ...listCardMetaStyle, marginTop: 8 };
// Текст ошибки — моноширинным шрифтом (как в логе Railway), перенос длинных
// строк без выхода за карточку на 360px (CLAUDE.md «Мобильный экран первым»):
// `overflowWrap: anywhere` рвёт даже слово без пробелов (длинный стек путей).
const textStyle: CSSProperties = {
  marginTop: 8,
  padding: '8px 10px',
  borderRadius: 'var(--radius-control)',
  background: 'var(--surface)',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  fontSize: 13,
  lineHeight: 1.5,
  whiteSpace: 'pre-wrap',
  overflowWrap: 'anywhere',
};
const requestIdStyle: CSSProperties = { ...listCardMetaStyle, marginTop: 8 };
const userAgentStyle: CSSProperties = {
  ...listCardMetaStyle,
  marginTop: 4,
  fontSize: 12,
};

interface DevErrorCardProps {
  error: AppErrorDto;
}

export function DevErrorCard({ error }: DevErrorCardProps) {
  return (
    <li style={rowStyle}>
      <div style={metaLineStyle}>
        {formatDateTime(error.occurredAt)} · {formatKindLabel(error.kind)} ·{' '}
        {formatSourceLabel(error.source)}
      </div>
      <div style={pathLineStyle}>
        {error.method ? `${error.method} ` : ''}
        {error.path}
      </div>
      <div style={textStyle}>{error.text}</div>
      {error.requestId && (
        <div style={requestIdStyle}>Код обращения: {error.requestId}</div>
      )}
      {error.userAgent && <div style={userAgentStyle}>{error.userAgent}</div>}
    </li>
  );
}
