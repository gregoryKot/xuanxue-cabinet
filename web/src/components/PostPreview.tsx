// Превью текста поста — один стиль на весь кабинет (CLAUDE.md «Одна механика
// — один компонент»): раньше `<pre>` с одинаковым `whiteSpace: 'pre-wrap'`
// дублировался в DeliveryCard.tsx, BroadcastFormFields.tsx и
// TemplateEditor.tsx, jscpd поймал бы дубль (pr-k3-fixes.md п.11).
// `overflowWrap: 'anywhere'` — длинная ссылка без пробелов не толкает экран
// в горизонтальный скролл на 360px (CLAUDE.md «Мобильный экран первым»).
import type { CSSProperties } from 'react';

const previewStyle: CSSProperties = {
  margin: 0,
  padding: 12,
  borderRadius: 8,
  border: '1px solid var(--border)',
  background: '#fff',
  whiteSpace: 'pre-wrap',
  overflowWrap: 'anywhere',
  fontSize: 14,
};

export function PostPreview({ text, style }: { text: string; style?: CSSProperties }) {
  return <pre style={{ ...previewStyle, ...style }}>{text}</pre>;
}
