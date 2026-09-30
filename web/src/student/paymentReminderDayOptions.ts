// Варианты выбора дня напоминания об оплате (ADR-0161) — чистая логика без DOM:
// значение `<select>` — строка, а сервер ждёт число или `null`, и перевод туда и
// обратно живёт в одном месте, а не в обработчике компонента. Общего дня у
// школы нет: кто день не выбрал, напоминания не получает.
import { SETTINGS_LIMITS, type MyPaymentReminderDto } from '@xuanxue/shared';

/** Значение варианта «Не напоминать»: пустая строка, чтобы не совпасть ни с
 * одним числом 1–31. Уходит на сервер как `null` — выбор снимается. */
export const NO_DAY_VALUE = '';

export interface DayOption {
  value: string;
  label: string;
}

const DAYS = Array.from(
  { length: SETTINGS_LIMITS.paymentReminderDayMax },
  (_, index) => SETTINGS_LIMITS.paymentReminderDayMin + index,
);

/** «Не напоминать» и дальше 1..31 («12-го числа»). */
export const DAY_OPTIONS: readonly DayOption[] = [
  { value: NO_DAY_VALUE, label: 'Не напоминать' },
  ...DAYS.map((day) => ({ value: String(day), label: `${day}-го числа` })),
];

/** Какой вариант выбран сейчас: свой день или «Не напоминать». */
export function selectedDayValue(reminder: MyPaymentReminderDto): string {
  return reminder.dayOfMonth === null ? NO_DAY_VALUE : String(reminder.dayOfMonth);
}

/** Значение select → тело запроса: `null` — «Не напоминать». */
export function dayFromValue(value: string): number | null {
  return value === NO_DAY_VALUE ? null : Number(value);
}

/** Подсказка под полем: что произойдёт при нынешнем выборе. Акцент — на
 * факте, который ученик ищет глазами: день и час (`**` рисует RichText). */
export function reminderHint(reminder: MyPaymentReminderDto): string {
  if (reminder.dayOfMonth === null) {
    return `Выберите день — напомним об оплате в **${reminder.time}** по времени школы.`;
  }
  return `Напомним **${reminder.dayOfMonth}-го** в **${reminder.time}** по времени школы. Если в месяце нет такого числа — в последний день.`;
}
