// Варианты выбора «За сколько напомнить» о занятии (ADR-0162, п. 3) — чистая
// логика без DOM: значение `<select>` — строка, а сервер ждёт число из
// LESSON_REMINDER_CHOICES или `null` («как в школе»), и перевод туда и обратно
// живёт в одном месте, а не в обработчике компонента. Тот же приём, что у
// student/paymentReminderDayOptions.ts.
import {
  LESSON_REMINDER_CHOICES,
  effectiveReminderMinutes,
  formatDurationRu,
  type LessonReminderDto,
} from '@xuanxue/shared';

/** Значение варианта «Как в школе»: пустая строка, чтобы не совпасть ни с
 * одним числом минут. Уходит на сервер как `null` — свой выбор снимается. */
export const SCHOOL_REMINDER_VALUE = '';

export interface ReminderOption {
  value: string;
  label: string;
}

/** Срок после «за»: «за 1 час», «за 45 минут», «за 21 минуту». formatDurationRu
 * даёт именительный падеж, а после «за» «минута» женского рода меняется на
 * «минуту» (школьное значение — любое от 5 минут, и 21, 31, 41 среди них
 * бывают). Остальные формы — «час», «часа», «минут» — в обоих падежах те же. */
function durationAfterZa(minutes: number): string {
  return formatDurationRu(minutes).replace(/ минута$/, ' минуту');
}

/** «Как в школе — за 1 час» и четыре своих варианта из общего списка
 * (`LESSON_REMINDER_CHOICES`, тот же, что проверяет сервер). Школьное значение
 * учитель ставит сам и оно может быть любым (45 минут), поэтому подпись
 * первого пункта собирается из ответа сервера, а не берётся из списка. */
export function lessonReminderOptions(reminder: LessonReminderDto): ReminderOption[] {
  return [
    {
      value: SCHOOL_REMINDER_VALUE,
      label: `Как в школе — за ${durationAfterZa(reminder.schoolMinutes)}`,
    },
    ...LESSON_REMINDER_CHOICES.map((minutes) => ({
      value: String(minutes),
      label: `За ${durationAfterZa(minutes)}`,
    })),
  ];
}

/** Какой вариант выбран сейчас: свой или «Как в школе». */
export function selectedReminderValue(reminder: LessonReminderDto): string {
  return reminder.minutes === null ? SCHOOL_REMINDER_VALUE : String(reminder.minutes);
}

/** Значение select → тело запроса: `null` — «Как в школе». */
export function reminderMinutesFromValue(value: string): number | null {
  return value === SCHOOL_REMINDER_VALUE ? null : Number(value);
}

/** Подсказка под полем: когда придёт напоминание при нынешнем выборе. Акцент —
 * на сроке, который человек ищет глазами (`**` рисует RichText, ADR-0124). Срок
 * считает та же `effectiveReminderMinutes`, что и тик на сервере: экран и
 * доставка не разойдутся в ответе на «когда придёт». */
export function lessonReminderHint(reminder: LessonReminderDto): string {
  const minutes = effectiveReminderMinutes(reminder.minutes, reminder.schoolMinutes);
  return `Напоминание придёт за **${durationAfterZa(minutes)}** до начала занятия.`;
}
