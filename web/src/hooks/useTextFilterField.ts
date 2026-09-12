// Текстовый фильтр, который уходит наружу не на каждое нажатие клавиши, а на
// потерю фокуса или Enter — иначе список мигал бы на каждую букву. Общая
// механика для тега вопроса (exam-items/ExamItemFilters.tsx) и уровня формы
// экзамена (exams/ExamFilters.tsx, ТЗ 4.3) — раньше жила только внутри
// ExamItemFilters, второй экран скопировал бы её (CLAUDE.md «Одна механика —
// один компонент»).
import { useEffect, useState, type KeyboardEvent } from 'react';

export interface UseTextFilterFieldResult {
  text: string;
  setText: (text: string) => void;
  commit: () => void;
  handleKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
}

export function useTextFilterField(
  value: string,
  onChange: (next: string) => void,
): UseTextFilterFieldResult {
  const [text, setText] = useState(value);
  // Внешний сброс фильтра (например, кнопкой «Сбросить») должен отразиться
  // в поле — иначе после сброса в инпуте остался бы старый текст.
  useEffect(() => setText(value), [value]);

  function commit() {
    const trimmed = text.trim();
    if (trimmed !== value) onChange(trimmed);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    commit();
  }

  return { text, setText, commit, handleKeyDown };
}
