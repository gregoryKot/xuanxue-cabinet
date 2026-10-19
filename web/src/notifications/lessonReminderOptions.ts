// Варианты выбора «За сколько напомнить» о занятии (ADR-0185) — чистая логика
// без DOM: значение `<select>` — строка, а сервер ждёт минуты из
// REMINDER_SYNC_LEAD_CHOICES или `null` («как в школе»), и перевод туда и обратно
// живёт в одном месте, а не в обработчике компонента. `0` — напоминание в момент
// начала занятия, а не «выключено»: выключает вид «Занятие скоро» переключатель.
import {
  REMINDER_SYNC_LEAD_CHOICES,
  effectiveReminderMinutes,
  formatDurationRu,
  type ReminderChange,
  type ReminderSyncSnapshot,
} from '@xuanxue/shared';

/** Значение варианта «Как в школе»: пустая строка, чтобы не совпасть ни с
 * одним числом минут. Уходит на сервер как `null` — свой выбор снимается. */
export const SCHOOL_REMINDER_VALUE = '';

export interface ReminderOption {
  value: string;
  label: string;
}

/** Часть снимка, из которой строятся варианты и подсказка. */
type LeadSettings = Pick<ReminderSyncSnapshot, 'leadMinutes' | 'schoolMinutes'>;

const AT_START_LABEL = 'В момент начала';
const AT_START_MINUTES = 0;

/** Срок после «за»: «за 1 час», «за 45 минут», «за 21 минуту». formatDurationRu
 * даёт именительный падеж, а после «за» «минута» женского рода меняется на
 * «минуту» (школьное значение — любое от 5 минут, и 21, 31, 41 среди них
 * бывают). Остальные формы — «час», «часа», «минут» — в обоих падежах те же. */
function durationAfterZa(minutes: number): string {
  return formatDurationRu(minutes).replace(/ минута$/, ' минуту');
}

function ownOptionLabel(minutes: number): string {
  return minutes === AT_START_MINUTES ? AT_START_LABEL : `За ${durationAfterZa(minutes)}`;
}

/** «Как в школе — за 1 час» и свои варианты из общего списка
 * (`REMINDER_SYNC_LEAD_CHOICES`, тот же, что проверяет сервер). Школьное значение
 * учитель ставит сам и оно может быть любым (45 минут), поэтому подпись
 * первого пункта собирается из ответа сервера, а не берётся из списка. */
export function lessonReminderOptions(settings: LeadSettings): ReminderOption[] {
  return [
    {
      value: SCHOOL_REMINDER_VALUE,
      label: `Как в школе — за ${durationAfterZa(settings.schoolMinutes)}`,
    },
    ...REMINDER_SYNC_LEAD_CHOICES.map((minutes) => ({
      value: String(minutes),
      label: ownOptionLabel(minutes),
    })),
  ];
}

/** Какой вариант выбран сейчас: свой или «Как в школе». */
export function selectedReminderValue(settings: LeadSettings): string {
  return settings.leadMinutes === null
    ? SCHOOL_REMINDER_VALUE
    : String(settings.leadMinutes);
}

/** Значение select → изменение для `PATCH`. Значение, которого нет в списке
 * вариантов, изменения не даёт: молча превратить его в «Как в школе» значило бы
 * стереть выбор человека. */
export function leadChangeFromValue(value: string): ReminderChange | null {
  if (value === SCHOOL_REMINDER_VALUE) return { kind: 'lead', minutes: null };
  const minutes = REMINDER_SYNC_LEAD_CHOICES.find((choice) => String(choice) === value);
  return minutes === undefined ? null : { kind: 'lead', minutes };
}

/** Подсказка под полем: когда придёт напоминание при нынешнем выборе. Акцент —
 * на сроке, который человек ищет глазами (`**` рисует RichText, ADR-0124). Срок
 * считает та же `effectiveReminderMinutes`, что и тик на сервере: экран и
 * доставка не разойдутся в ответе на «когда придёт». */
export function lessonReminderHint(settings: LeadSettings): string {
  const minutes = effectiveReminderMinutes(settings.leadMinutes, settings.schoolMinutes);
  if (minutes === AT_START_MINUTES) {
    return 'Напоминание придёт **в момент начала** занятия.';
  }
  return `Напоминание придёт за **${durationAfterZa(minutes)}** до начала занятия.`;
}
