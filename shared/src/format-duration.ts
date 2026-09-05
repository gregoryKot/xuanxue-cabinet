// «{длительность}» в шаблонах постов (docs/PLAN.md §6): 30 → «30 минут»,
// 90 → «1,5 часа». Склонение — через встроенный Intl.PluralRules('ru'), а не
// самодельное правило по остатку от 10: такое правило ошибается на 111–114 и
// 211–214 («111 минута» вместо «111 минут») и не покрывает дробные часы
// (CLAUDE.md, раздел «Зависимости»: предпочитаем встроенное библиотеке).

const RU_PLURAL_RULES = new Intl.PluralRules('ru');

interface PluralForms {
  readonly one: string;
  readonly few: string;
  readonly many: string;
  readonly other: string;
}

function pluralForm(n: number, forms: PluralForms): string {
  const category = RU_PLURAL_RULES.select(n);
  switch (category) {
    case 'one':
      return forms.one;
    case 'few':
      return forms.few;
    case 'many':
      return forms.many;
    case 'zero':
    case 'two':
    case 'other':
      return forms.other;
  }
}

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
  if (!isWholeHours) return `${minutes} ${pluralForm(minutes, MINUTE_FORMS)}`;
  const hours = minutes / 60;
  const hoursText = String(hours).replace('.', ',');
  return `${hoursText} ${pluralForm(hours, HOUR_FORMS)}`;
}
