// Кнопка, выглядящая ссылкой: действие второго плана прямо в тексте
// («Отправить ещё раз» на экране «письмо ушло»). Не Button — киноварь на
// экране уже занята главным действием, а контурная кнопка рядом с абзацем
// читалась бы как второе равное ему (правило акцента, docs/adr/0031).
//
// Элемент остаётся `<button>`: это действие, а не переход, и `<a href>` тут
// соврал бы клавиатуре и скринридеру. Высота ≥44 — цель нажатия пальцем
// (CLAUDE.md «Доступность»).
import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react';
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

// Опасное действие («Отменить» рассылку) — тот же силуэт, но текстом в
// --danger: киноварь на экране остаётся у одного главного действия
// (docs/adr/0031, правило акцента).
const dangerStyle: CSSProperties = { ...buttonStyle, color: 'var(--danger)' };

// «Раскрыть/Свернуть» строки журнала «Рассылок» (docs/adr/0043) — терракота
// текстом, не тушь: макет красит именно это действие акцентом семь раз на
// разных экранах (ADR-0043, «Отклонения от макета»), а «Отменить» рядом
// остаётся отдельным --danger — два разных смысла, не один цвет на оба.
// --terracotta-text, не --terracotta: тот же приём, что и везде в этом
// направлении — акцент текстом мельче кегля 14px иначе не держит AA 4.5.
const accentStyle: CSSProperties = { ...buttonStyle, color: 'var(--terracotta-text)' };

interface TextLinkButtonProps extends Pick<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'aria-expanded' | 'aria-controls'
> {
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  /** Акцентный текст терракотой — «Раскрыть/Свернуть» в журнале «Рассылок»
   * (docs/adr/0043). Не сочетается по смыслу с `danger` — если передать оба,
   * побеждает `danger`: опасность важнее декоративного акцента. */
  accent?: boolean;
  children: ReactNode;
}

export function TextLinkButton({
  onClick,
  disabled,
  danger,
  accent,
  children,
  ...aria
}: TextLinkButtonProps) {
  const style = danger ? dangerStyle : accent ? accentStyle : buttonStyle;
  return (
    <button type="button" style={style} onClick={onClick} disabled={disabled} {...aria}>
      {children}
    </button>
  );
}
