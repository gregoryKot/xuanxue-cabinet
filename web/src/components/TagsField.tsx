// Поле ввода тегов — общая механика (CLAUDE.md «Одна механика — один
// компонент»): раньше было своей копией в materials/MaterialFormFields.tsx (с
// даталистом подсказок) и в exam-items/ExamItemFormFields.tsx (без него),
// скоро понадобится третья — на странице даты занятия (ADR-0059). Компонент
// сам теги не разбирает: ввод — строка через запятую, разбор общий,
// parseTagsText из @xuanxue/shared (ADR-0058), им занимается вызывающая
// сторона при сохранении. Подсказки-даталист — необязательны: у вопросов
// экзамена их нет, options не передаётся вовсе.
import { useId } from 'react';
import { Field, inputStyle } from './Field';

const LABEL = 'Теги';

interface TagsFieldProps {
  value: string;
  onChange: (value: string) => void;
  hint: string;
  options?: readonly string[];
  error?: string;
}

export function TagsField({ value, onChange, hint, options, error }: TagsFieldProps) {
  // useId, не константа: два поля тегов на одной странице не должны делить
  // один id даталиста (образец использования — hooks/useHistorySheet.ts).
  const datalistId = useId();
  const tagOptions = options ?? [];
  const hasOptions = tagOptions.length > 0;

  return (
    <Field label={LABEL} hint={hint} error={error}>
      <input
        style={inputStyle}
        list={hasOptions ? datalistId : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {hasOptions ? (
        <datalist id={datalistId}>
          {tagOptions.map((tag) => (
            <option key={tag} value={tag} />
          ))}
        </datalist>
      ) : null}
    </Field>
  );
}
