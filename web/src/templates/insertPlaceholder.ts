// Вставка подстановки в текст шаблона по позиции курсора/выделения — чистая
// функция без DOM (CLAUDE.md «Чистая логика»): TemplateEditor.tsx читает
// выделение из ref textarea и передаёт числа сюда, никакой другой логики
// вставки в компоненте нет (отзыв владельца 2026-09-08 — учитель перепечатывал
// имена подстановок руками вместе со скобками).
export interface InsertPlaceholderResult {
  /** Текст с подстановкой на месте выделения. */
  text: string;
  /** Позиция курсора сразу после вставленной подстановки — сюда
   * TemplateEditor ставит курсор через `setSelectionRange`. */
  cursor: number;
}

/** Заменяет выделение `[selectionStart, selectionEnd)` на `{name}`. Пустое
 * выделение (курсор без выбранного текста) — обычная вставка в это место. */
export function insertPlaceholder(
  text: string,
  selectionStart: number,
  selectionEnd: number,
  name: string,
): InsertPlaceholderResult {
  const insertion = `{${name}}`;
  const before = text.slice(0, selectionStart);
  const after = text.slice(selectionEnd);
  return { text: before + insertion + after, cursor: before.length + insertion.length };
}
