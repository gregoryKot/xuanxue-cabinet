// Строка общей карточки списка (docs/adr/0043) — одна механика для «Вопросов»
// и «Экзаменов» вместо двух копий (exam-items/ExamItemCard.tsx,
// exams/ExamCard.tsx несли одинаковый `rowButtonStyle` и волосяную линию
// снизу, jscpd поймал бы третью копию у следующего списка). Без `selection`
// строка — то же самое, что раньше: `<li><button onClick={onOpen}>`. С
// `selection` (ADR-0141, массовое удаление) клик открывает не запись, а
// отмечает строку — вся строка кликабельна через `<label>`, доступное имя
// чекбокса — весь текст строки, не отдельная подпись (та же механика, что у
// components/Toggle.tsx, чей вид галочки здесь и переиспользован).
import type { CSSProperties, ReactNode } from 'react';
import { toggleInputStyle } from './Toggle';

// Тот же сброс рамки/фона кнопки, что раньше жил в ExamItemCard.tsx/ExamCard.tsx
// (`<button>` иначе рисуется обведённым поверх общей карточки списка,
// components/listCardStyles.ts).
const rowButtonStyle: CSSProperties = {
  display: 'block',
  width: '100%',
  minHeight: 44,
  padding: '16px 20px',
  border: 'none',
  background: 'transparent',
  font: 'inherit',
  textAlign: 'left',
  cursor: 'pointer',
};
const rowLabelStyle: CSSProperties = {
  ...rowButtonStyle,
  display: 'flex',
  alignItems: 'flex-start',
  gap: 12,
};
// Чекбокс выше базовой линии первой строки текста — сдвиг компенсирует их
// разную высоту, чтобы обе стояли на одной визуальной линии.
const checkboxStyle: CSSProperties = { ...toggleInputStyle, marginTop: 2 };
const contentStyle: CSSProperties = { minWidth: 0, flex: 1 };

export interface SelectableListRowSelection {
  isSelected: boolean;
  onToggle: () => void;
}

interface SelectableListRowProps {
  /** Последняя строка общей карточки списка — без нижней волосяной линии
   * (docs/adr/0043). */
  isLast?: boolean;
  onOpen: () => void;
  /** Задан — строка в режиме массового выбора (ADR-0141): клик отмечает, а
   * не открывает запись. */
  selection?: SelectableListRowSelection;
  children: ReactNode;
}

export function SelectableListRow({
  isLast = false,
  onOpen,
  selection,
  children,
}: SelectableListRowProps) {
  const liStyle: CSSProperties = {
    borderBottom: isLast ? 'none' : '1px solid var(--panel)',
    background: selection?.isSelected ? 'var(--panel)' : undefined,
  };

  if (!selection) {
    return (
      <li style={liStyle}>
        <button type="button" style={rowButtonStyle} onClick={onOpen}>
          {children}
        </button>
      </li>
    );
  }

  return (
    <li style={liStyle}>
      <label style={rowLabelStyle}>
        <input
          type="checkbox"
          checked={selection.isSelected}
          onChange={selection.onToggle}
          style={checkboxStyle}
        />
        <span style={contentStyle}>{children}</span>
      </label>
    </li>
  );
}
