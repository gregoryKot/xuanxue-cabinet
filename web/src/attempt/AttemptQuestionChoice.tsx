// Один или несколько вариантов ответа (ТЗ п.2) — радиогруппа для «single»,
// чекбоксы для «multiple»; нативные input'ы работают с клавиатуры без
// единого атрибута ARIA (CLAUDE.md «Доступность»), как в exam-items/
// ExamItemOptionsField.tsx. Выбор варианта — дискретное действие, а не
// печать: сохраняем сразу после него, не ждём 2-секундный дебаунс текста.
import type { CSSProperties } from 'react';
import type { AttemptOptionDto } from '@xuanxue/shared';

const optionRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  minHeight: 44,
};
const inputMarkStyle: CSSProperties = { width: 22, height: 22, flexShrink: 0 };

interface AttemptQuestionChoiceProps {
  index: number;
  itemId: string;
  kind: 'single' | 'multiple';
  options: AttemptOptionDto[];
  selected: string[];
  onChange: (optionIds: string[]) => void;
}

export function AttemptQuestionChoice({
  index,
  itemId,
  kind,
  options,
  selected,
  onChange,
}: AttemptQuestionChoiceProps) {
  function toggle(optionId: string, checked: boolean) {
    // Радиокнопка присылает `change` только когда её выбрали: «отжать» её
    // мышью или клавиатурой нельзя, поэтому ветки «сняли отметку» у `single`
    // не существует — она была бы мёртвым кодом.
    if (kind === 'single') {
      onChange([optionId]);
      return;
    }
    onChange(
      checked ? [...selected, optionId] : selected.filter((id) => id !== optionId),
    );
  }

  return (
    <div
      role={kind === 'single' ? 'radiogroup' : 'group'}
      aria-label={`Вариант ответа, вопрос ${index + 1}`}
      style={{ display: 'flex', flexDirection: 'column', gap: 4 }}
    >
      {options.map((option) => (
        <label key={option.id} style={optionRowStyle}>
          <input
            type={kind === 'single' ? 'radio' : 'checkbox'}
            name={kind === 'single' ? `attempt-${itemId}` : undefined}
            style={inputMarkStyle}
            checked={selected.includes(option.id)}
            onChange={(event) => toggle(option.id, event.target.checked)}
          />
          <span>{option.text}</span>
        </label>
      ))}
    </div>
  );
}
