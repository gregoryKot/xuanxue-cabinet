// «Сдать до» (ADR-0125, дополнено ADR-0139) — состояние и преобразования
// одного поля формы экзамена: только дата, без времени. Час не нужен —
// срок действует до конца выбранного дня включительно (23:59:59.999 по часам
// зрителя), а поле времени рядом с датой добавляло выбор, который никто не
// использовал осмысленно (отзыв владельца 2026-09-27). Отдельным файлом — не
// потому что поле сложное, а потому что examFormInput.ts уже стоит ровно на
// потолке размера (CLAUDE.md «Храповики», 150 строк) и не может вырасти ни
// на строку без выноса.
import { endOfDayIsoFromDateValue, toDateInputValue } from '../lib/formatDate';

export function initialDueDate(dueAt: string | undefined): string {
  return dueAt ? toDateInputValue(dueAt) : '';
}

/** `null` — поле валидно (пусто — без срока, или разобралось), иначе текст
 * ошибки под полем. */
export function validateDueDateText(dueDateText: string): string | null {
  if (!dueDateText) return null;
  return endOfDayIsoFromDateValue(dueDateText) === null
    ? 'Срок сдачи указан неверно.'
    : null;
}

/** ISO конца выбранного дня для отправки, `undefined` — поле пустое (create
 * его не отправляет, update превращает в явный `null`-сброс —
 * toUpdateInput в examFormInput.ts, тот же приём, что у timeLimitMin). */
export function dueDateToIso(dueDateText: string): string | undefined {
  return dueDateText ? (endOfDayIsoFromDateValue(dueDateText) ?? undefined) : undefined;
}
