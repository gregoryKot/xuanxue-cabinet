// Превью текста поста — один стиль на весь кабинет (CLAUDE.md «Одна механика
// — один компонент»): раньше `<pre>` с одинаковым `whiteSpace: 'pre-wrap'`
// дублировался в DeliveryCard.tsx, BroadcastFormFields.tsx и
// TemplateEditor.tsx, jscpd поймал бы дубль (pr-k3-fixes.md п.11).
// `overflowWrap: 'anywhere'` — длинная ссылка без пробелов не толкает экран
// в горизонтальный скролл на 360px (CLAUDE.md «Мобильный экран первым»).
//
// Облик — «Тёплая школа» (docs/adr/0043): белая поверхность и радиус строки
// списка, без границы. Тени у превью нет намеренно: внутри DeliveryCard оно
// лежит на карточке доставки с её --shadow-card, и тень на тени читается
// грязно — отдельной поверхностью превью делают фон и радиус.
import type { CSSProperties } from 'react';

const previewStyle: CSSProperties = {
  margin: 0,
  padding: 12,
  background: 'var(--card)',
  borderRadius: 'var(--radius-card)',
  whiteSpace: 'pre-wrap',
  overflowWrap: 'anywhere',
  fontSize: 14,
};

export function PostPreview({ text, style }: { text: string; style?: CSSProperties }) {
  return <pre style={{ ...previewStyle, ...style }}>{text}</pre>;
}
