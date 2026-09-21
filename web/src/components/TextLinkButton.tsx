// Кнопка, выглядящая ссылкой: действие второго плана прямо в тексте
// («Отправить ещё раз» на экране «письмо ушло»). Не Button — заливка терракотой
// на экране уже занята главным действием, а контурная кнопка рядом с абзацем
// читалась бы как второе равное ему (правило акцента, docs/adr/0031).
//
// Элемент остаётся `<button>`: это действие, а не переход, и `<a href>` тут
// соврал бы клавиатуре и скринридеру. Высота ≥44 — цель нажатия пальцем
// (CLAUDE.md «Доступность»).
import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react';
import { ChevronIcon } from './ChevronIcon';
import { textLinkHitAreaStyle, textLinkLineStyle } from './screenLayout';

// Линия — на внутреннем `<span>` (JSX ниже), не на самой кнопке: `border-
// bottom` на коробке 44px рисовался по её дну, в десятке пикселей от букв, и
// кнопка читалась обычным абзацем — отзыв владельца 2026-09-21 про «Как
// выложить видео, чтобы учитель его открыл» и «У меня нет Telegram»
// («непонятно, что кнопка»). Разбор приёма — в screenLayout.ts.
const buttonStyle: CSSProperties = {
  ...textLinkHitAreaStyle,
  alignSelf: 'flex-start',
};

// Опасное действие («Отменить» рассылку) — тот же силуэт, но текстом в
// --danger: заливка терракотой на экране остаётся у одного главного действия
// (docs/adr/0031, правило акцента).
const dangerStyle: CSSProperties = { ...buttonStyle, color: 'var(--danger)' };

// «Раскрыть/Свернуть» строки журнала «Рассылок» (docs/adr/0043) — терракота
// текстом, не тушь: макет красит именно это действие акцентом семь раз на
// разных экранах (ADR-0043, «Отклонения от макета»), а «Отменить» рядом
// остаётся отдельным --danger — два разных смысла, не один цвет на оба.
// --terracotta-text, не --terracotta: тот же приём, что и везде в этом
// направлении — акцент текстом мельче кегля 14px иначе не держит AA 4.5.
const accentStyle: CSSProperties = { ...buttonStyle, color: 'var(--terracotta-text)' };

// Знак раскрытия — только у кнопки, которая раскрывает блок на месте
// (`aria-expanded` передан). Линия под буквами говорит «это нажимается»,
// шеврон добавляет «откроется здесь, а не уведёт на другой экран»: отзыв
// владельца 2026-09-21 про «Как выложить видео, чтобы учитель его открыл» —
// «непонятна подсказка, непонятно, что кнопка». Знак стоит ЗА линией, не под
// ней: линия помечает слова, а не значок.
const chevronStyle: CSSProperties = { marginLeft: 6, verticalAlign: 'middle' };

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
  const expanded = aria['aria-expanded'];
  return (
    <button type="button" style={style} onClick={onClick} disabled={disabled} {...aria}>
      <span style={textLinkLineStyle}>{children}</span>
      {expanded !== undefined && (
        <ChevronIcon
          collapsed={expanded === false || expanded === 'false'}
          style={chevronStyle}
        />
      )}
    </button>
  );
}
