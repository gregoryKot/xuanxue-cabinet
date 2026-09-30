// Варианты выбора дня напоминания об оплате (ADR-0161) — чистая логика без DOM:
// значение `<select>` — строка, а сервер ждёт число или `null`, и перевод туда и
// обратно живёт в одном месте, а не в обработчике компонента.
import { SETTINGS_LIMITS, type MyPaymentReminderDto } from '@xuanxue/shared';

/** Значение варианта «Как у школы»: пустая строка, чтобы не совпасть ни с
 * одним числом 1–31. Уходит на сервер как `null` — сброс личного выбора. */
export const SCHOOL_DAY_VALUE = '';

export interface DayOption {
  value: string;
  label: string;
}

/** Какой вариант выбран сейчас: свой день или «как у школы». Когда своего дня
 * нет, `dayOfMonth` — это день школы, и подставлять его в select нельзя:
 * человек увидел бы «5-го числа» как свой выбор, которого не делал. */
export function selectedDayValue(reminder: MyPaymentReminderDto): string {
  return reminder.isOwnDay ? String(reminder.dayOfMonth) : SCHOOL_DAY_VALUE;
}

/** Значение select → тело запроса: `null` — «как у школы». */
export function dayFromValue(value: string): number | null {
  return value === SCHOOL_DAY_VALUE ? null : Number(value);
}

/** «Как у школы — 5-го» и дальше 1..31 («12-го числа»). Число школы стоит в
 * первом варианте, чтобы человек видел, что получит, ничего не выбирая. */
export function buildDayOptions(schoolDay: number): DayOption[] {
  const days = Array.from(
    { length: SETTINGS_LIMITS.paymentReminderDayMax },
    (_, index) => SETTINGS_LIMITS.paymentReminderDayMin + index,
  );
  return [
    { value: SCHOOL_DAY_VALUE, label: `Как у школы — ${schoolDay}-го` },
    ...days.map((day) => ({ value: String(day), label: `${day}-го числа` })),
  ];
}
