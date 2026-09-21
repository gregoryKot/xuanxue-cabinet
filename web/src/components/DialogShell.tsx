// Оверлей, карточка и обвязка доступности одного диалога — общая механика
// для любого попапа с кнопками (CLAUDE.md «Одна механика — один компонент»):
// раньше жила только в ConfirmDialog.tsx, вынесена сюда, чтобы NoticeDialog.tsx
// (одна кнопка вместо двух) не копировал её — копия поймал бы
// check-jscpd-ratchet.mjs. `position: fixed; inset: 0` — через useHistorySheet,
// как любой полноэкранный слой (CLAUDE.md «Фронтенд»): кнопка «Назад» браузера
// закрывает диалог, а не уводит из кабинета. Ряд кнопок рисует потребитель
// (`renderActions`) — у ConfirmDialog их две, у NoticeDialog одна, порядок и
// стиль остаются его выбором.
//
// Облик — «Тёплая школа» (docs/adr/0043-visual-direction-warm-school.md):
// белая карточка с мягкой тенью поверх затемнения, без границы; почему именно
// --card и --radius-block — у cardStyle ниже.
import type { CSSProperties, ReactNode } from 'react';
import { useId } from 'react';
import { useDialog } from '../hooks/useDialog';
import { useHistorySheet } from '../hooks/useHistorySheet';

const overlayStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(15, 23, 20, 0.45)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 16,
  zIndex: 60,
};
// Карточка диалога. Поверх затемнения (overlayStyle) её отделяет от экрана
// не граница, а сама поверхность — белая карточка с мягкой тенью. Прежний
// --surface-2 вёл на --paper, тон самой страницы: под затемнением такой
// диалог читался бы дырой в нём, а не листом поверх. Радиус блока, не строки
// списка: диалог несёт заголовок, текст и ряд кнопок целиком.
const cardStyle: CSSProperties = {
  background: 'var(--card)',
  borderRadius: 'var(--radius-block)',
  boxShadow: 'var(--shadow-card)',
  padding: 20,
  maxWidth: 360,
  width: '100%',
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
};
const actionsRowStyle: CSSProperties = {
  display: 'flex',
  gap: 10,
  justifyContent: 'flex-end',
};

export interface DialogShellProps {
  title: string;
  /** Тело диалога. */
  children: ReactNode;
  /** Ряд кнопок. `close` закрывает диалог тем же путём, что «Назад» браузера
   * (useHistorySheet) — кнопки обязаны звать её, а не `onClose` напрямую. */
  renderActions: (close: () => void) => ReactNode;
  onClose: () => void;
}

export function DialogShell({
  title,
  children,
  renderActions,
  onClose,
}: DialogShellProps) {
  const goBack = useHistorySheet(onClose);
  const { headingRef, containerRef } = useDialog(goBack);
  // Заголовок за useId(), а не жёсткой строкой — у ConfirmDialog поверх
  // ChannelSheet, например, id-конфликт дал бы двум разным диалогам одну
  // и ту же aria-labelledby-ссылку.
  const titleId = useId();

  return (
    <div
      // Колбэк, а не containerRef напрямую — див ждёт ref на HTMLDivElement,
      // а useDialog отдаёт RefObject<HTMLElement | null> (общий для любого
      // корня диалога); присваивание значения-подтипа обходится без `as`-каста.
      ref={(node) => {
        containerRef.current = node;
      }}
      style={overlayStyle}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div style={cardStyle}>
        <h2
          ref={headingRef}
          tabIndex={-1}
          id={titleId}
          style={{ margin: 0, fontSize: 17 }}
        >
          {title}
        </h2>
        {children}
        <div style={actionsRowStyle}>{renderActions(goBack)}</div>
      </div>
    </div>
  );
}
