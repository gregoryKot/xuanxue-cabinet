// «Сдать до» (ADR-0124) — состояние и преобразования одного поля формы
// экзамена, тем же контролом и форматом, что «Дата и время начала» у
// занятия (planning/lessonFormInput.ts, тот же datetime-local и та же пара
// toDatetimeLocalValue/fromDatetimeLocalValue). Отдельным файлом — не
// потому что поле сложное, а потому что examFormInput.ts уже стоит ровно на
// потолке размера (CLAUDE.md «Храповики», 150 строк) и не может вырасти ни
// на строку без выноса.
import { fromDatetimeLocalValue, toDatetimeLocalValue } from '../lib/formatDate';

export function initialDueAtLocal(dueAt: string | undefined): string {
  return dueAt ? toDatetimeLocalValue(dueAt) : '';
}

/** `null` — поле валидно (пусто — без срока, или разобралось), иначе текст
 * ошибки под полем. */
export function validateDueAtText(dueAtLocal: string): string | null {
  if (!dueAtLocal) return null;
  return fromDatetimeLocalValue(dueAtLocal) === null
    ? 'Срок сдачи указан неверно.'
    : null;
}

/** ISO для отправки, `undefined` — поле пустое (create его не отправляет,
 * update превращает в явный `null`-сброс — toUpdateInput в examFormInput.ts,
 * тот же приём, что у timeLimitMin). */
export function dueAtToIso(dueAtLocal: string): string | undefined {
  return dueAtLocal ? (fromDatetimeLocalValue(dueAtLocal) ?? undefined) : undefined;
}
