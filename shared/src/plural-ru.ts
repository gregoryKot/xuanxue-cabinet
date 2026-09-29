// Склонение числительных по-русски — общий примитив для любого текста с
// числом (дни, минуты, часы, …). Intl.PluralRules('ru'), не самодельное
// правило по остатку от 10 — такое правило ошибается на 111–114/211–214
// («111 минута» вместо «111 минут», CLAUDE.md «Зависимости»: встроенное
// вместо своего). Раньше жило только в format-duration.ts — теперь общее,
// summary.format.ts (api) склоняет так же дни периода.
const RU_PLURAL_RULES = new Intl.PluralRules('ru');

export interface PluralForms {
  readonly one: string;
  readonly few: string;
  readonly many: string;
  readonly other: string;
}

export function pluralRu(n: number, forms: PluralForms): string {
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

const DAY_FORMS: PluralForms = { one: 'день', few: 'дня', many: 'дней', other: 'дня' };

/** «30 дней», «1 день», «41 день» — срок в днях для текста пользователю: сроки
 * хранения на странице `/privacy` (ADR-0155) и рядом с кнопкой загрузки
 * скриншота. Не целое и не положительное → '' (как formatDurationRu): такого
 * срока в тексте быть не должно, а пустая строка заметнее «0 дней». */
export function formatDaysRu(days: number): string {
  if (!Number.isInteger(days) || days <= 0) return '';
  return `${days} ${pluralRu(days, DAY_FORMS)}`;
}

const YEAR_FORMS: PluralForms = { one: 'год', few: 'года', many: 'лет', other: 'года' };

/** «3 года», «1 год», «11 лет» — срок в годах, тем же приёмом, что formatDaysRu
 * (срок хранения попытки экзамена, EXAM_ATTEMPT_RETENTION_YEARS). */
export function formatYearsRu(years: number): string {
  if (!Number.isInteger(years) || years <= 0) return '';
  return `${years} ${pluralRu(years, YEAR_FORMS)}`;
}
