// Строка списка, которую можно смахнуть, чтобы убрать (общая механика —
// CLAUDE.md «Одна механика — один компонент»; первый читатель — центр
// уведомлений, просьба владельца 2026-09-22 «уведомление нельзя смахнуть,
// удалить»). Числа и состояние жеста — в useSwipeRow.ts, здесь только слои:
// кнопка «Убрать» лежит под содержимым всегда (в DOM, достижима с
// клавиатуры), жест лишь открывает её быстрее (CLAUDE.md «Доступность»).
import type { CSSProperties, MouseEvent, ReactNode } from 'react';
import { SWIPE_BUTTON_WIDTH, useSwipeRow } from './useSwipeRow';

const DISMISS_BUTTON_TEXT = 'Убрать';
// Гасится на время перетаскивания (dragging) в самом рендере — жест обязан
// следовать за пальцем без задержки; на отпускании — эта же анимация
// довозит строку до открытого/закрытого положения. `prefers-reduced-motion`
// глушит длительность глобальным правилом в конце index.css, отдельно
// заботиться об этом здесь не нужно.
const SETTLE_TRANSITION = 'transform 0.2s ease';

const wrapperStyle: CSSProperties = { position: 'relative', overflow: 'hidden' };

const contentLayerStyle: CSSProperties = {
  position: 'relative',
  // Выше кнопки под собой, хотя в разметке идёт ПЕРЕД ней: порядок в DOM
  // здесь задан порядком обхода клавишей Tab (сначала само уведомление,
  // потом «Убрать» для него — наоборот скринридер называл бы действие
  // раньше, чем то, к чему оно относится), а кто поверх кого — этим
  // `zIndex`, не порядком.
  zIndex: 1,
  background: 'var(--card)',
};

const dismissButtonStyle: CSSProperties = {
  position: 'absolute',
  top: 0,
  bottom: 0,
  right: 0,
  width: SWIPE_BUTTON_WIDTH,
  minHeight: 44,
  border: 'none',
  background: 'var(--danger)',
  // var(--card-soft) на var(--danger) — 8.1:1 (посчитано по формуле WCAG,
  // тот же приём комментариев, что у контрастов в index.css).
  color: 'var(--card-soft)',
  font: 'inherit',
  fontWeight: 500,
  cursor: 'pointer',
};

interface SwipeRowProps {
  children: ReactNode;
  onDismiss: () => void;
  /** Доступное имя кнопки — вызывающий передаёт осмысленное (например,
   * «Убрать уведомление: …»); видимый текст кнопки остаётся общим. */
  dismissLabel: string;
  /** Последняя строка своей карточки — не красит линию снизу. */
  isLast?: boolean;
  /** На время запроса — гасит и кнопку, и жест. */
  disabled?: boolean;
}

export function SwipeRow({
  children,
  onDismiss,
  dismissLabel,
  isLast,
  disabled,
}: SwipeRowProps) {
  const gesture = useSwipeRow(disabled);

  // Перехват в фазе погружения — раньше, чем сработает собственный onClick
  // содержимого (Link/button внутри children): пока строка открыта, нажатие
  // закрывает её, а не уводит по ссылке или зовёт то, что было под пальцем.
  function handleContentClick(e: MouseEvent) {
    if (gesture.closeIfOpen()) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  return (
    <li
      style={{
        ...wrapperStyle,
        borderBottom: isLast ? undefined : '1px solid var(--line)',
      }}
    >
      <div
        onTouchStart={gesture.onTouchStart}
        onTouchMove={gesture.onTouchMove}
        onTouchEnd={gesture.onTouchEnd}
        onClickCapture={handleContentClick}
        style={{
          ...contentLayerStyle,
          transform: `translateX(-${gesture.offset}px)`,
          transition: gesture.dragging ? 'none' : SETTLE_TRANSITION,
        }}
      >
        {children}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        onFocus={gesture.openRow}
        disabled={disabled}
        aria-label={dismissLabel}
        style={{ ...dismissButtonStyle, opacity: disabled ? 0.7 : 1 }}
      >
        {DISMISS_BUTTON_TEXT}
      </button>
    </li>
  );
}
