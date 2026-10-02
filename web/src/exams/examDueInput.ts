// «Сдать до» (ADR-0125, дополнено ADR-0139) — состояние и преобразования
// одного поля формы экзамена: только дата, без времени. Час не нужен —
// срок действует до конца выбранного дня включительно (23:59:59.999), а
// поле времени рядом с датой добавляло выбор, который никто не использовал
// осмысленно (отзыв владельца 2026-09-27). Конец дня — по часам ШКОЛЫ
// (SCHOOL_TZ), не браузера учителя: бот считает пресет так же
// (new-exam-due.ts, ADR-0127), а до аудита 2026-10-01 (F61) кабинет брал
// пояс устройства, и «2 октября» с телефона не в Израиле давало другой
// момент, чем та же дата из бота. Одна функция в shared на обе точки ввода
// (endOfDayInZoneIso); обратно в значение поля — тот же пояс (dateKey).
// Отдельным файлом — не потому что поле сложное, а потому что
// examFormInput.ts уже стоит ровно на потолке размера (CLAUDE.md
// «Храповики», 150 строк) и не может вырасти ни на строку без выноса.
import { endOfDayInZoneIso, SCHOOL_TZ } from '@xuanxue/shared';
import { dateKey } from '../lib/formatDate';

/** ISO срока → значение `<input type="date">` (YYYY-MM-DD) в поясе школы —
 * тот же день, что выбрали при сохранении, с любого устройства. */
export function initialDueDate(dueAt: string | undefined): string {
  return dueAt ? dateKey(dueAt, SCHOOL_TZ) : '';
}

/** `null` — поле валидно (пусто — без срока, или разобралось), иначе текст
 * ошибки под полем. */
export function validateDueDateText(dueDateText: string): string | null {
  if (!dueDateText) return null;
  return endOfDayInZoneIso(dueDateText, SCHOOL_TZ) === null
    ? 'Срок сдачи указан неверно.'
    : null;
}

/** ISO конца выбранного дня по часам школы для отправки, `undefined` — поле
 * пустое (create его не отправляет, update превращает в явный `null`-сброс —
 * toUpdateInput в examFormInput.ts, тот же приём, что у timeLimitMin). */
export function dueDateToIso(dueDateText: string): string | undefined {
  return dueDateText
    ? (endOfDayInZoneIso(dueDateText, SCHOOL_TZ) ?? undefined)
    : undefined;
}
