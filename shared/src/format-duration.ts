// «{длительность}» в шаблонах постов (docs/PLAN.md §6): 30 → «30 минут»,
// 90 → «1,5 часа». Склонение — pluralRu (plural-ru.ts), общий примитив на
// Intl.PluralRules('ru'), не самодельное правило по остатку от 10: такое
// правило ошибается на 111–114 и 211–214 и не покрывает дробные часы.
import { pluralRu, type PluralForms } from './plural-ru';

const MINUTE_FORMS: PluralForms = {
  one: 'минута',
  few: 'минуты',
  many: 'минут',
  other: 'минут',
};
// Дробное число часов (Intl.PluralRules('ru') отдаёт для него 'other') всегда
// читается как «часа» — «1,5 часа», «2,5 часа» (реальные посты не дробят
// минуты, только получасовые занятия дают дробные часы).
const HOUR_FORMS: PluralForms = { one: 'час', few: 'часа', many: 'часов', other: 'часа' };

/**
 * «{длительность}» для шаблона поста. Кратно 30 минутам и не меньше часа —
 * в часах (дробь через запятую), иначе — в минутах. 0, отрицательное и
 * не целое (в том числе NaN из формы) → ''.
 */
export function formatDurationRu(minutes: number): string {
  if (!Number.isInteger(minutes) || minutes <= 0) return '';
  const isWholeHours = minutes % 30 === 0 && minutes >= 60;
  if (!isWholeHours) return `${minutes} ${pluralRu(minutes, MINUTE_FORMS)}`;
  const hours = minutes / 60;
  const hoursText = String(hours).replace('.', ',');
  return `${hoursText} ${pluralRu(hours, HOUR_FORMS)}`;
}
