// Кнопка, выглядящая ссылкой: действие второго плана прямо в тексте
// («Отправить ещё раз» на экране «письмо ушло»). Не Button — киноварь на
// экране уже занята главным действием, а контурная кнопка рядом с абзацем
// читалась бы как второе равное ему (правило акцента, docs/adr/0031).
//
// Элемент остаётся `<button>`: это действие, а не переход, и `<a href>` тут
// соврал бы клавиатуре и скринридеру. Высота ≥44 — цель нажатия пальцем
// (CLAUDE.md «Доступность»).
import type { CSSProperties, ReactNode } from 'react';
import { textLinkStyle } from './screenLayout';

const buttonStyle: CSSProperties = {
  ...textLinkStyle,
  alignSelf: 'flex-start',
  minHeight: 44,
  padding: '10px 0',
  background: 'none',
  border: 0,
  borderBottom: '1px solid var(--control-border)',
  font: 'inherit',
  cursor: 'pointer',
};

interface TextLinkButtonProps {
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}

export function TextLinkButton({ onClick, disabled, children }: TextLinkButtonProps) {
  return (
    <button type="button" style={buttonStyle} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}
