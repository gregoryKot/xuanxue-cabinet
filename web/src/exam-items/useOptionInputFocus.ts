// Фокус текстового поля варианта после добавления строки (отзыв владельца
// 2026-09-27 — добавляет вопросы подряд, не хочет кликать по новому полю
// отдельно). Вынесен из ExamItemOptionsField.tsx — тот упёрся в 150 строк
// файлового храповика (CLAUDE.md «Храповики»), а логика фокуса не завязана
// на остальные правила поля (добавление/удаление/картинка/видео).
//
// `markFocusNext` взводится перед добавлением строки (клик «Добавить
// вариант» или Enter в последнем варианте), эффект разряжает его и
// фокусирует уже отрисованную новую строку — раньше фокусировать нечего.
// Флаг — ref, не state: сам по себе не должен вызывать лишний рендер.
import { useEffect, useRef } from 'react';

export interface UseOptionInputFocusResult {
  /** Callback-ref для текстового поля строки с этим индексом — передаётся
   * прямо в `ref` инпута (ExamItemOptionRow.tsx). */
  registerInput: (index: number) => (el: HTMLInputElement | null) => void;
  /** Взводит фокус на новую строку — зовётся перед `onChange` с добавленным
   * вариантом. */
  markFocusNext: () => void;
  /** Фокусирует уже существующую строку по индексу — Enter в не последнем
   * варианте переводит туда фокус, не добавляя строку. */
  focusIndex: (index: number) => void;
}

export function useOptionInputFocus(optionsLength: number): UseOptionInputFocusResult {
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const focusNewOptionRef = useRef(false);

  useEffect(() => {
    if (!focusNewOptionRef.current) return;
    focusNewOptionRef.current = false;
    inputRefs.current[optionsLength - 1]?.focus();
  }, [optionsLength]);

  function registerInput(index: number) {
    return (el: HTMLInputElement | null) => {
      inputRefs.current[index] = el;
    };
  }

  function markFocusNext() {
    focusNewOptionRef.current = true;
  }

  function focusIndex(index: number) {
    inputRefs.current[index]?.focus();
  }

  return { registerInput, markFocusNext, focusIndex };
}
