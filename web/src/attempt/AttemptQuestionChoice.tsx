// Один или несколько вариантов ответа (ТЗ п.2) — радиогруппа для «single»,
// чекбоксы для «multiple». Переключатель — общий Toggle (CLAUDE.md «Одна
// механика — один компонент»): нативный input под `accent-color` кабинета
// вместо синей системной галочки, подпись обычным начертанием, строка
// высотой 44 (CLAUDE.md «Доступность»). Выбор варианта — дискретное
// действие, а не печать: сохраняем сразу после него, не ждём 2-секундный
// дебаунс текста.
import type { CSSProperties } from 'react';
import type { AttemptOptionDto } from '@xuanxue/shared';
import { Toggle } from '../components/Toggle';

const groupStyle: CSSProperties = { display: 'flex', flexDirection: 'column' };

interface AttemptQuestionChoiceProps {
  /** Идентификатор формулировки вопроса — она же подпись группы вариантов
   * (AttemptQuestion.tsx), своего заголовка у группы нет. */
  labelledBy: string;
  itemId: string;
  kind: 'single' | 'multiple';
  options: AttemptOptionDto[];
  selected: string[];
  onChange: (optionIds: string[]) => void;
}

export function AttemptQuestionChoice({
  labelledBy,
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
      aria-labelledby={labelledBy}
      style={groupStyle}
    >
      {options.map((option) => (
        <Toggle
          key={option.id}
          label={option.text}
          checked={selected.includes(option.id)}
          // Имя группы переводит Toggle в радио: взаимное исключение внутри
          // вопроса браузер делает сам (комментарий в самом Toggle.tsx).
          name={kind === 'single' ? `attempt-${itemId}` : undefined}
          onChange={(checked) => toggle(option.id, checked)}
        />
      ))}
    </div>
  );
}
