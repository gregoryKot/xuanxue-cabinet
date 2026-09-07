// Оболочка полноэкранного листа-формы (заголовок + «Закрыть» + сама форма) —
// одна механика на весь кабинет (CLAUDE.md «Одна механика — один компонент»):
// раньше overlay/sheet-стили и шапка дублировались в schedule/ClassSheet.tsx
// и planning/LessonSheet.tsx, jscpd поймал дубль. `position: fixed; inset: 0`
// сюда попадает готовым — открывший лист компонент сам вызвал useHistorySheet/
// useDialog и передаёт их результат.
import type { CSSProperties, FormEvent, ReactNode, RefObject } from 'react';
import { Button } from './Button';

const overlayStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(15, 23, 20, 0.45)',
  display: 'flex',
  alignItems: 'flex-end',
  zIndex: 50,
};
const sheetStyle: CSSProperties = {
  background: 'var(--surface-2)',
  width: '100%',
  maxHeight: '92vh',
  overflowY: 'auto',
  borderRadius: '16px 16px 0 0',
  padding: 20,
  display: 'flex',
  flexDirection: 'column',
  gap: 14,
};
const headerStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
};

interface SheetShellProps {
  titleId: string;
  title: string;
  headingRef: RefObject<HTMLHeadingElement | null>;
  onSubmit: (event: FormEvent) => void;
  onClose: () => void;
  children: ReactNode;
}

export function SheetShell({
  titleId,
  title,
  headingRef,
  onSubmit,
  onClose,
  children,
}: SheetShellProps) {
  return (
    <div style={overlayStyle} role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <form style={sheetStyle} onSubmit={onSubmit}>
        <div style={headerStyle}>
          <h2
            ref={headingRef}
            tabIndex={-1}
            id={titleId}
            style={{ margin: 0, fontSize: 18 }}
          >
            {title}
          </h2>
          <Button type="button" variant="secondary" onClick={onClose}>
            Закрыть
          </Button>
        </div>
        {children}
      </form>
    </div>
  );
}
