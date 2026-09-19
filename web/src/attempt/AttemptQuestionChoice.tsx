// Один или несколько вариантов ответа (ТЗ п.2) — радиогруппа для «single»,
// чекбоксы для «multiple». Переключатель — общий Toggle (CLAUDE.md «Одна
// механика — один компонент»): нативный input под `accent-color` кабинета
// вместо синей системной галочки, подпись обычным начертанием, строка
// высотой 44 (CLAUDE.md «Доступность»). Выбор варианта — дискретное
// действие, а не печать: сохраняем сразу после него, не ждём 2-секундный
// дебаунс текста.
//
// Подпись — formatOptionLabel (ADR-0035): у варианта-картинки без своего
// текста это «Вариант N», та же строка, что у бота. На экране её не видно
// (`labelHidden`) — она стояла бы прямо над самой картинкой и не говорила
// ничего (отзыв владельца 2026-09-19); доступным именем и `alt` остаётся.
// Картинка — `media`
// у Toggle, `size="full"`: экран сдачи один вопрос на весь экран, места
// больше, чем у миниатюры в редакторе/статистике.
import type { CSSProperties } from 'react';
import { formatOptionLabel, type AttemptOptionDto } from '@xuanxue/shared';
import { OptionImage } from '../components/OptionImage';
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
  /** Предпросмотр глазами ученика (exams/ExamPreviewQuestion.tsx): та же
   * строка, но ответить нельзя. */
  disabled?: boolean;
  onChange: (optionIds: string[]) => void;
}

export function AttemptQuestionChoice({
  labelledBy,
  itemId,
  kind,
  options,
  selected,
  disabled,
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
      {options.map((option, index) => {
        const label = formatOptionLabel(option.text, index);
        // Своего текста нет, а картинка есть — «Вариант N» видно не будет:
        // подпись остаётся доступным именем и `alt` картинки (Toggle.tsx).
        const labelHidden = !option.text && option.imageId != null;
        return (
          <Toggle
            key={option.id}
            label={label}
            labelHidden={labelHidden}
            checked={selected.includes(option.id)}
            disabled={disabled}
            // Имя группы переводит Toggle в радио: взаимное исключение внутри
            // вопроса браузер делает сам (комментарий в самом Toggle.tsx).
            name={kind === 'single' ? `attempt-${itemId}` : undefined}
            media={
              option.imageId ? (
                <OptionImage imageId={option.imageId} size="full" alt={label} />
              ) : undefined
            }
            onChange={(checked) => toggle(option.id, checked)}
          />
        );
      })}
    </div>
  );
}
