// Выбор одного из нескольких строками-радио — общая механика (CLAUDE.md «Одна
// механика — один компонент»), парная к CheckboxListField: тот же `fieldset`,
// `legend`, подсказка, текст пустого состояния и ошибка под списком. Строка —
// тот же Toggle с `name`, он рисует нативный radio, поэтому выбор работает с
// клавиатуры и читается скринридером без ARIA. Группа радио получает общее
// имя из `useId`: два списка на одной странице не сливаются в один выбор.
// Выбранное — `selectedId`; пустая строка у вызывающей стороны — обычное
// значение («Без группы»), а не «ничего не выбрано».
import { forwardRef, useId, type ReactNode } from 'react';
import { ListFieldFrame } from './ListFieldFrame';
import { Toggle } from './Toggle';

export interface RadioListOption {
  id: string;
  label: string;
  /** Строка под подписью (Toggle.hint). */
  hint?: string;
}

interface RadioListFieldProps {
  legend: string;
  options: RadioListOption[];
  selectedId: string;
  onChange: (id: string) => void;
  hint?: ReactNode;
  /** Показывается, когда вариантов нет вовсе. */
  emptyMessage?: ReactNode;
  error?: string;
}

export const RadioListField = forwardRef<HTMLFieldSetElement, RadioListFieldProps>(
  function RadioListField(
    { legend, options, selectedId, onChange, hint, emptyMessage, error },
    ref,
  ) {
    const name = useId();

    return (
      <ListFieldFrame
        ref={ref}
        legend={legend}
        hint={hint}
        error={error}
        isEmpty={options.length === 0}
        emptyMessage={emptyMessage}
      >
        {options.map((option) => (
          <Toggle
            key={option.id}
            name={name}
            label={option.label}
            hint={option.hint}
            checked={selectedId === option.id}
            onChange={(checked) => {
              if (checked) onChange(option.id);
            }}
          />
        ))}
      </ListFieldFrame>
    );
  },
);
